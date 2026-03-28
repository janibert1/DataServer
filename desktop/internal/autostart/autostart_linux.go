//go:build linux

package autostart

import (
	"fmt"
	"os"
	"path/filepath"
)

const desktopEntry = `[Desktop Entry]
Type=Application
Name=DataServer
Comment=DataServer file sync daemon
Exec=%s daemon
Hidden=false
X-GNOME-Autostart-enabled=true
`

func autostartPath() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "autostart", "dataserver.desktop")
	}
	return filepath.Join(os.Getenv("HOME"), ".config", "autostart", "dataserver.desktop")
}

func Enable(binaryPath string) error {
	path := autostartPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	content := fmt.Sprintf(desktopEntry, binaryPath)
	return os.WriteFile(path, []byte(content), 0644)
}

func Disable() error {
	return os.Remove(autostartPath())
}
