package logger

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
)

func Init() {
	level := getLogLevel()
	opts := slog.HandlerOptions{
		Level: level,
	}

	handler := &coloredHandler{
		Handler: slog.NewTextHandler(os.Stdout, &opts),
	}

	slog.SetDefault(slog.New(handler))

	slog.Info("Logger initialized", "level", level.String())
}

type coloredHandler struct {
	slog.Handler
}

func (h *coloredHandler) Handle(ctx context.Context, r slog.Record) error {
	level := r.Level.String()
	message := r.Message

	var levelColor, resetColor string
	switch r.Level {
	case slog.LevelDebug:
		levelColor = "\033[90m" // Gray
	case slog.LevelInfo:
		levelColor = "\033[94m" // Blue
	case slog.LevelWarn:
		levelColor = "\033[93m" // Yellow
	case slog.LevelError:
		levelColor = "\033[91m" // Red
	default:
		levelColor = "\033[0m"
	}
	resetColor = "\033[0m"

	timestamp := r.Time.Format("15:04:05")

	var builder strings.Builder
	builder.WriteString(timestamp)
	builder.WriteString(" ")
	builder.WriteString(levelColor)
	builder.WriteString(fmt.Sprintf("%-5s", level))
	builder.WriteString(resetColor)
	builder.WriteString(" ")
	builder.WriteString(message)

	if r.NumAttrs() > 0 {
		builder.WriteString(" ")
		r.Attrs(func(attr slog.Attr) bool {
			builder.WriteString(fmt.Sprintf("%s=%v ", attr.Key, attr.Value))
			return true
		})
	}

	fmt.Println(builder.String())
	return nil
}

func getLogLevel() slog.Level {
	if levelStr := os.Getenv("LOG_LEVEL"); levelStr != "" {
		switch strings.ToUpper(levelStr) {
		case "DEBUG":
			return slog.LevelDebug
		case "INFO":
			return slog.LevelInfo
		case "WARN":
			return slog.LevelWarn
		case "ERROR":
			return slog.LevelError
		}
	}
	return slog.LevelInfo
}
