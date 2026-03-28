package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/jan/dataserver-desktop/internal/api"
	"github.com/jan/dataserver-desktop/internal/auth"
	"github.com/jan/dataserver-desktop/internal/config"
	"github.com/jan/dataserver-desktop/internal/logger"
	dsync "github.com/jan/dataserver-desktop/internal/sync"
)

func init() {
	rootCmd.AddCommand(syncCmd)
}

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Run a single sync cycle (foreground)",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		logger.Init(cfg.LogLevel)

		token, err := auth.LoadToken()
		if err != nil || token == "" {
			return fmt.Errorf("not logged in. Run 'dataserver login' first")
		}

		os.MkdirAll(cfg.SyncDir, 0755)

		client := api.NewClient(cfg.ServerURL, token)
		state, err := dsync.OpenStateDB()
		if err != nil {
			return fmt.Errorf("open state db: %w", err)
		}
		defer state.Close()

		engine := dsync.NewEngine(client, state)
		if err := engine.RunOnce(); err != nil {
			return fmt.Errorf("sync failed: %w", err)
		}

		fmt.Println("Sync complete.")
		return nil
	},
}
