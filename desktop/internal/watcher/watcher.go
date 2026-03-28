package watcher

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/rs/zerolog/log"

	"github.com/jan/dataserver-desktop/internal/config"
)

type Watcher struct {
	fsWatcher  *fsnotify.Watcher
	syncDir    string
	onChange   func()
	debounce   time.Duration
	ignorePats []string
	stopCh     chan struct{}
}

func New(syncDir string, onChange func()) (*Watcher, error) {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	cfg := config.Get()
	w := &Watcher{
		fsWatcher:  fw,
		syncDir:    syncDir,
		onChange:   onChange,
		debounce:   2 * time.Second,
		ignorePats: cfg.IgnoredPatterns,
		stopCh:     make(chan struct{}),
	}

	return w, nil
}

func (w *Watcher) Start() error {
	// Add all existing directories recursively
	if err := w.addRecursive(w.syncDir); err != nil {
		return err
	}

	go w.loop()
	return nil
}

func (w *Watcher) Stop() {
	close(w.stopCh)
	w.fsWatcher.Close()
}

func (w *Watcher) loop() {
	var timer *time.Timer
	var timerC <-chan time.Time

	for {
		select {
		case <-w.stopCh:
			return
		case event, ok := <-w.fsWatcher.Events:
			if !ok {
				return
			}

			// Ignore our own temp files
			if strings.HasSuffix(event.Name, ".dsync-tmp") {
				continue
			}

			// Check ignore patterns
			base := filepath.Base(event.Name)
			ignored := false
			for _, pat := range w.ignorePats {
				if matched, _ := filepath.Match(pat, base); matched {
					ignored = true
					break
				}
			}
			if ignored {
				continue
			}

			// If a directory was created, watch it
			if event.Has(fsnotify.Create) {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					w.addRecursive(event.Name)
				}
			}

			log.Debug().Str("event", event.Op.String()).Str("path", event.Name).Msg("FS event")

			// Debounce
			if timer == nil {
				timer = time.NewTimer(w.debounce)
				timerC = timer.C
			} else {
				timer.Reset(w.debounce)
			}

		case err, ok := <-w.fsWatcher.Errors:
			if !ok {
				return
			}
			log.Warn().Err(err).Msg("Watcher error")

		case <-timerC:
			timer = nil
			timerC = nil
			log.Debug().Msg("Triggering sync from file watcher")
			w.onChange()
		}
	}
}

func (w *Watcher) addRecursive(root string) error {
	return filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			return nil
		}

		base := filepath.Base(path)
		for _, pat := range w.ignorePats {
			if matched, _ := filepath.Match(pat, base); matched {
				return filepath.SkipDir
			}
		}

		return w.fsWatcher.Add(path)
	})
}
