package config

import (
	"encoding/json"
	"os"
	"sync"
)

type Config struct {
	ServerURL        string   `json:"serverUrl"`
	SyncDir          string   `json:"syncDir"`
	PollInterval     int      `json:"pollIntervalSeconds"`
	IgnoredPatterns  []string `json:"ignoredPatterns"`
	LogLevel         string   `json:"logLevel"`
}

var (
	current *Config
	mu      sync.RWMutex
)

func defaults() Config {
	return Config{
		SyncDir:         DefaultSyncDir(),
		PollInterval:    30,
		IgnoredPatterns: []string{".DS_Store", "Thumbs.db", "*.tmp", ".git", "desktop.ini", ".Trash-*"},
		LogLevel:        "info",
	}
}

func Load() (*Config, error) {
	mu.Lock()
	defer mu.Unlock()

	cfg := defaults()

	data, err := os.ReadFile(ConfigFilePath())
	if err != nil {
		if os.IsNotExist(err) {
			current = &cfg
			return current, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	if cfg.SyncDir == "" {
		cfg.SyncDir = DefaultSyncDir()
	}
	if cfg.PollInterval < 5 {
		cfg.PollInterval = 30
	}

	current = &cfg
	return current, nil
}

func Save(cfg *Config) error {
	mu.Lock()
	defer mu.Unlock()

	if err := os.MkdirAll(ConfigDir(), 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	current = cfg
	return os.WriteFile(ConfigFilePath(), data, 0600)
}

func Get() *Config {
	mu.RLock()
	defer mu.RUnlock()
	if current == nil {
		cfg := defaults()
		return &cfg
	}
	c := *current
	return &c
}
