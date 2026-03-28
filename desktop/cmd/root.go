package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "dataserver",
	Short: "DataServer desktop sync client",
	Long:  "Sync your DataServer files to a local folder, like OneDrive or iCloud Drive.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
