package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/jan/dataserver-desktop/internal/api"
	"github.com/jan/dataserver-desktop/internal/auth"
	"github.com/jan/dataserver-desktop/internal/config"
	dsync "github.com/jan/dataserver-desktop/internal/sync"
)

func init() {
	rootCmd.AddCommand(statusCmd)
}

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show sync status",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		fmt.Printf("Server:    %s\n", cfg.ServerURL)
		fmt.Printf("Sync dir:  %s\n", cfg.SyncDir)
		fmt.Printf("Interval:  %ds\n", cfg.PollInterval)

		if !auth.IsLoggedIn() {
			fmt.Println("Status:    Not logged in")
			return nil
		}

		token, _ := auth.LoadToken()
		client := api.NewClient(cfg.ServerURL, token)
		user, err := client.GetMe()
		if err != nil {
			fmt.Printf("Status:    Token invalid (%v)\n", err)
			return nil
		}

		fmt.Printf("User:      %s (%s)\n", user.DisplayName, user.Email)

		state, err := dsync.OpenStateDB()
		if err == nil {
			defer state.Close()
			files, _ := state.AllFiles()
			folders, _ := state.AllFolders()
			cursor, _ := state.GetCursor("lastSyncTime")
			fmt.Printf("Synced:    %d files, %d folders\n", len(files), len(folders))
			if cursor != "" {
				fmt.Printf("Last sync: %s\n", cursor)
			}
		}

		return nil
	},
}
