package logger

import (
	"io"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/jan/dataserver-desktop/internal/config"
)

func Init(level string) {
	zlevel, err := zerolog.ParseLevel(level)
	if err != nil {
		zlevel = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(zlevel)

	// Console output for development
	consoleWriter := zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: "15:04:05"}

	// Also log to file
	logPath := config.LogFilePath()
	_ = os.MkdirAll(config.ConfigDir(), 0700)
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		log.Logger = zerolog.New(consoleWriter).With().Timestamp().Logger()
		return
	}

	multi := io.MultiWriter(consoleWriter, logFile)
	log.Logger = zerolog.New(multi).With().Timestamp().Logger()
}
