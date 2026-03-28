//go:build darwin

package autostart

import (
	"fmt"
	"os"
	"path/filepath"
)

const plistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.dataserver.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>%s/dataserver.log</string>
    <key>StandardErrorPath</key>
    <string>%s/dataserver.log</string>
</dict>
</plist>
`

func plistPath() string {
	return filepath.Join(os.Getenv("HOME"), "Library", "LaunchAgents", "com.dataserver.sync.plist")
}

func Enable(binaryPath string) error {
	path := plistPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	logDir := filepath.Join(os.Getenv("HOME"), "Library", "Logs")
	content := fmt.Sprintf(plistTemplate, binaryPath, logDir, logDir)
	return os.WriteFile(path, []byte(content), 0644)
}

func Disable() error {
	return os.Remove(plistPath())
}
