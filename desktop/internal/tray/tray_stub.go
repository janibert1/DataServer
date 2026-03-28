//go:build notray

package tray

import (
	"github.com/rs/zerolog/log"
)

type TrayCallbacks struct {
	OnSyncNow func()
	OnPause   func()
	OnResume  func()
	OnLogin   func()
	OnLogout  func()
	OnQuit    func()
	SyncDir   string
	ServerURL string
	IsPaused  func() bool
}

func Run(cb TrayCallbacks) {
	log.Warn().Msg("System tray not available in this build. Use --no-tray flag.")
}
