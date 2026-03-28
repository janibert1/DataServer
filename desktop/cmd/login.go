package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"github.com/jan/dataserver-desktop/internal/api"
	"github.com/jan/dataserver-desktop/internal/auth"
	"github.com/jan/dataserver-desktop/internal/autostart"
	"github.com/jan/dataserver-desktop/internal/config"
)

func init() {
	rootCmd.AddCommand(loginCmd)
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Log in to your DataServer",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return fmt.Errorf("load config: %w", err)
		}

		if cfg.ServerURL == "" {
			fmt.Print("Enter your DataServer URL (e.g. https://dataserver.example.com): ")
			fmt.Scanln(&cfg.ServerURL)
			if cfg.ServerURL == "" {
				return fmt.Errorf("server URL is required")
			}
			config.Save(cfg)
		}

		// Generate device code
		code, err := auth.GenerateDeviceCode()
		if err != nil {
			return fmt.Errorf("generate device code: %w", err)
		}

		authURL := auth.DeviceAuthURL(cfg.ServerURL, code)
		fmt.Printf("\nOpening browser to authorize this device...\n")
		fmt.Printf("If the browser doesn't open, visit: %s\n\n", authURL)

		// Open browser
		openBrowser(authURL)

		fmt.Println("Waiting for authorization...")

		// Poll for token
		client := api.NewClient(cfg.ServerURL, "")
		resp, err := auth.PollForToken(client, code, 10*time.Minute)
		if err != nil {
			return fmt.Errorf("authorization failed: %w", err)
		}

		// Save token
		if err := auth.SaveToken(resp.Token); err != nil {
			return fmt.Errorf("save token: %w", err)
		}

		// Verify
		client.SetToken(resp.Token)
		user, err := client.GetMe()
		if err != nil {
			return fmt.Errorf("verify token: %w", err)
		}

		fmt.Printf("\nLogged in as %s (%s)\n", user.DisplayName, user.Email)

		// Create sync directory
		if err := os.MkdirAll(cfg.SyncDir, 0755); err != nil {
			log.Warn().Err(err).Msg("Failed to create sync directory")
		}
		fmt.Printf("Sync folder: %s\n", cfg.SyncDir)

		// Set up autostart
		exePath, _ := os.Executable()
		if err := autostart.Enable(exePath); err != nil {
			log.Warn().Err(err).Msg("Failed to enable autostart")
			fmt.Println("Note: Could not set up autostart. Run 'dataserver daemon' manually.")
		} else {
			fmt.Println("Autostart enabled — DataServer will sync on boot.")
		}

		fmt.Println("\nRun 'dataserver daemon' to start syncing now.")
		return nil
	},
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Warn().Err(err).Msg("Could not open browser")
	}
}
