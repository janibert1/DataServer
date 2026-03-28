package config

import (
	"os"
	"path/filepath"
	"runtime"
)

func ConfigDir() string {
	if runtime.GOOS == "darwin" {
		return filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "DataServer")
	}
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "dataserver")
	}
	return filepath.Join(os.Getenv("HOME"), ".config", "dataserver")
}

func DefaultSyncDir() string {
	return filepath.Join(os.Getenv("HOME"), "DataServer")
}

func ConfigFilePath() string {
	return filepath.Join(ConfigDir(), "config.json")
}

func StateDBPath() string {
	return filepath.Join(ConfigDir(), "state.db")
}

func LogFilePath() string {
	return filepath.Join(ConfigDir(), "dataserver.log")
}
