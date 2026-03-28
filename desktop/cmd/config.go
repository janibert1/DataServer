package cmd

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/jan/dataserver-desktop/internal/config"
)

func init() {
	rootCmd.AddCommand(configCmd)
}

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Show or edit configuration",
	RunE: func(cmd *cobra.Command, args []string) error {
		cfg, err := config.Load()
		if err != nil {
			return err
		}

		data, _ := json.MarshalIndent(cfg, "", "  ")
		fmt.Println(string(data))
		fmt.Printf("\nConfig file: %s\n", config.ConfigFilePath())
		return nil
	},
}
