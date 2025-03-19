package logger

import (
	"fmt"
	"log/slog"
	"os"
)

var Logger *slog.Logger

func InitLogger() {
	opts := slog.HandlerOptions{
		Level: slog.LevelDebug,
	}

	Logger = slog.New(slog.NewTextHandler(os.Stdout, &opts))

	Logger.Info("Initialized logger")
}

func Info(mes string, args ...any) {
	Logger.Info(fmt.Sprintf(mes, args...))
}

func Debug(mes string, args ...any) {
	Logger.Debug(fmt.Sprintf(mes, args...))
}

func Error(mes string, args ...any) {
	Logger.Error(fmt.Sprintf(mes, args...))
}
