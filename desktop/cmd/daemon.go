package cmd

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"github.com/jan/dataserver-desktop/internal/api"
	"github.com/jan/dataserver-desktop/internal/auth"
	"github.com/jan/dataserver-desktop/internal/config"
	"github.com/jan/dataserver-desktop/internal/logger"
	dsync "github.com/jan/dataserver-desktop/internal/sync"
	"github.com/jan/dataserver-desktop/internal/tray"
	"github.com/jan/dataserver-desktop/internal/watcher"
)

var noTray bool

func init() {
	daemonCmd.Flags().BoolVar(&noTray, "no-tray", false, "Run without system tray (headless mode)")
	rootCmd.AddCommand(daemonCmd)
}

var daemonCmd = &cobra.Command{
	Use:   "daemon",
	Short: "Start the sync daemon (with system tray)",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("load config: %w", err)
		}

		logger.Init(cfg.LogLevel)

		if cfg.ServerURL == "" {
			return fmt.Errorf("not configured. Run 'dataserver login' first")
		}

		token, err := auth.LoadToken()
		if err != nil || token == "" {
			return fmt.Errorf("not logged in. Run 'dataserver login' first")
		}

		// Create sync directory
		os.MkdirAll(cfg.SyncDir, 0755)

		client := api.NewClient(cfg.ServerURL, token)

		// Verify auth
		user, err := client.GetMe()
		if err != nil {
			return fmt.Errorf("auth failed (token may be expired): %w\nRun 'dataserver login' to re-authenticate", err)
		}
		log.Info().Str("user", user.DisplayName).Str("email", user.Email).Msg("Authenticated")

		// Open state DB
		state, err := dsync.OpenStateDB()
		if err != nil {
			return fmt.Errorf("open state database: %w", err)
		}
		defer state.Close()

		engine := dsync.NewEngine(client, state)

		// File watcher
		triggerSync := make(chan struct{}, 1)
		fw, err := watcher.New(cfg.SyncDir, func() {
			select {
			case triggerSync <- struct{}{}:
			default:
			}
		})
		if err != nil {
			log.Warn().Err(err).Msg("File watcher unavailable, using polling only")
		} else {
			fw.Start()
			defer fw.Stop()
		}

		// Signal handling
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

		stopCh := make(chan struct{})

		// Sync loop
		go func() {
			// Initial sync
			if err := engine.RunOnce(); err != nil {
				log.Error().Err(err).Msg("Initial sync failed")
			}

			ticker := time.NewTicker(time.Duration(cfg.PollInterval) * time.Second)
			defer ticker.Stop()

			for {
				select {
				case <-stopCh:
					return
				case <-ticker.C:
					if err := engine.RunOnce(); err != nil {
						log.Error().Err(err).Msg("Sync cycle failed")
					}
				case <-triggerSync:
					if err := engine.RunOnce(); err != nil {
						log.Error().Err(err).Msg("Triggered sync failed")
					}
				}
			}
		}()

		// Auto-detect headless when no display is available
		if !noTray && os.Getenv("DISPLAY") == "" && os.Getenv("WAYLAND_DISPLAY") == "" {
			log.Info().Msg("No display detected, switching to headless mode")
			noTray = true
		}

		if noTray {
			// Headless mode
			log.Info().Msg("Running in headless mode (no tray). Press Ctrl+C to stop.")
			<-sigCh
			close(stopCh)
			log.Info().Msg("Shutting down...")
		} else {
			// System tray mode — runs on main thread (required by macOS)
			go func() {
				<-sigCh
				close(stopCh)
				// systray.Quit() must be called to unblock Run()
				// but we can't import it here without circular dep
				// The quit callback in tray handles this
				os.Exit(0)
			}()

			tray.Run(tray.TrayCallbacks{
				SyncDir:   cfg.SyncDir,
				ServerURL: cfg.ServerURL,
				OnSyncNow: func() {
					engine.RunOnce()
				},
				OnPause: func() {
					engine.SetPaused(true)
					log.Info().Msg("Syncing paused")
				},
				OnResume: func() {
					engine.SetPaused(false)
					log.Info().Msg("Syncing resumed")
				},
				OnLogout: func() {
					auth.DeleteToken()
					log.Info().Msg("Logged out")
					close(stopCh)
				},
				OnQuit: func() {
					close(stopCh)
					log.Info().Msg("Quitting")
				},
				IsPaused: engine.IsPaused,
			})
		}

		return nil
	},
}
