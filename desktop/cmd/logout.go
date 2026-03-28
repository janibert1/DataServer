package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/jan/dataserver-desktop/internal/auth"
	"github.com/jan/dataserver-desktop/internal/autostart"
	"github.com/jan/dataserver-desktop/internal/config"
	dsync "github.com/jan/dataserver-desktop/internal/sync"
)

func init() {
	rootCmd.AddCommand(logoutCmd)
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Log out and stop syncing",
	RunE: func(cmd *cobra.Command, args []string) error {
		// Remove autostart
		autostart.Disable()

		// Delete token from keyring
		if err := auth.DeleteToken(); err != nil {
			fmt.Printf("Warning: could not remove token from keyring: %v\n", err)
		}

		// Clear local state
		state, err := dsync.OpenStateDB()
		if err == nil {
			state.ClearAll()
			state.Close()
		}

		// Clear server URL from config
		cfg, _ := config.Load()
		if cfg != nil {
			cfg.ServerURL = ""
			config.Save(cfg)
		}

		fmt.Println("Logged out. Your local files remain in the sync folder.")
		return nil
	},
}
