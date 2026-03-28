//go:build !notray

package tray

import (
	"fmt"
	"os/exec"
	"runtime"

	"github.com/getlantern/systray"
	"github.com/rs/zerolog/log"

	dsync "github.com/jan/dataserver-desktop/internal/sync"
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
	systray.Run(func() { onReady(cb) }, func() {})
}

func onReady(cb TrayCallbacks) {
	systray.SetIcon(iconData)
	systray.SetTitle("DataServer")
	systray.SetTooltip("DataServer Sync")

	mStatus := systray.AddMenuItem("Status: Starting...", "Current sync status")
	mStatus.Disable()

	systray.AddSeparator()

	mOpenFolder := systray.AddMenuItem("Open Sync Folder", "Open the DataServer folder")
	mOpenBrowser := systray.AddMenuItem("Open in Browser", "Open DataServer in browser")

	systray.AddSeparator()

	mSyncNow := systray.AddMenuItem("Sync Now", "Trigger immediate sync")
	mPause := systray.AddMenuItem("Pause Syncing", "Pause/resume sync")

	systray.AddSeparator()

	mLogout := systray.AddMenuItem("Logout", "Log out and stop syncing")
	mQuit := systray.AddMenuItem("Quit", "Quit DataServer")

	// Status update ticker
	go func() {
		for {
			status := dsync.CurrentStatus.Load().(dsync.SyncStatus)
			title := "DataServer"
			switch status.State {
			case "syncing":
				title = "DataServer - Syncing..."
				mStatus.SetTitle(fmt.Sprintf("Syncing: %s", status.Message))
			case "error":
				title = "DataServer - Error"
				mStatus.SetTitle(fmt.Sprintf("Error: %s", status.Message))
			default:
				mStatus.SetTitle("Status: Up to date")
			}
			systray.SetTooltip(title)

			if cb.IsPaused != nil && cb.IsPaused() {
				mPause.SetTitle("Resume Syncing")
				mStatus.SetTitle("Status: Paused")
			} else {
				mPause.SetTitle("Pause Syncing")
			}

			// Poor man's polling — check every 2 seconds
			select {
			case <-mQuit.ClickedCh:
				goto quit
			default:
			}

			// sleep via channel timeout
			select {
			case <-mOpenFolder.ClickedCh:
				openPath(cb.SyncDir)
			case <-mOpenBrowser.ClickedCh:
				openURL(cb.ServerURL)
			case <-mSyncNow.ClickedCh:
				if cb.OnSyncNow != nil {
					go cb.OnSyncNow()
				}
			case <-mPause.ClickedCh:
				if cb.IsPaused != nil && cb.IsPaused() {
					if cb.OnResume != nil {
						cb.OnResume()
					}
				} else {
					if cb.OnPause != nil {
						cb.OnPause()
					}
				}
			case <-mLogout.ClickedCh:
				if cb.OnLogout != nil {
					cb.OnLogout()
				}
			case <-mQuit.ClickedCh:
				goto quit
			}
		}
	quit:
		if cb.OnQuit != nil {
			cb.OnQuit()
		}
		systray.Quit()
	}()
}

func openPath(path string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	default:
		cmd = exec.Command("xdg-open", path)
	}
	if err := cmd.Start(); err != nil {
		log.Error().Err(err).Str("path", path).Msg("Failed to open path")
	}
}

func openURL(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Error().Err(err).Str("url", url).Msg("Failed to open URL")
	}
}
