package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
)

type coloredHandler struct {
	slog.Handler
	useColors bool
}

func (h *coloredHandler) Handle(ctx context.Context, r slog.Record) error {
	level := r.Level.String()
	message := r.Message

	var levelColor, resetColor string
	if h.useColors {
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
	}

	timestamp := r.Time.Format("15:04:05")

	// Build the log line
	var builder strings.Builder
	builder.WriteString(timestamp)
	builder.WriteString(" ")
	builder.WriteString(levelColor)
	builder.WriteString(fmt.Sprintf("%-5s", level))
	builder.WriteString(resetColor)
	builder.WriteString(" ")
	builder.WriteString(message)

	// Add attributes if any
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

func useColors(w io.Writer) bool {
	if _, ok := w.(*os.File); ok {
		return os.Getenv("NO_COLOR") == "" && os.Getenv("TERM") != "dumb"
	}
	return false
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
	return slog.LevelInfo // Default to Info to reduce verbosity
}

func init() {
	level := getLogLevel()
	opts := slog.HandlerOptions{
		Level: level,
	}

	handler := &coloredHandler{
		Handler:   slog.NewTextHandler(os.Stdout, &opts),
		useColors: useColors(os.Stdout),
	}

	Logger = slog.New(handler)

	Logger.Info("Logger initialized", "level", level.String())
}

var Logger *slog.Logger

func Info(msg string, args ...any) {
	if len(args) == 0 {
		Logger.Info(msg)
	} else {
		Logger.Info(fmt.Sprintf(msg, args...))
	}
}

func Debug(msg string, args ...any) {
	if len(args) == 0 {
		Logger.Debug(msg)
	} else {
		Logger.Debug(fmt.Sprintf(msg, args...))
	}
}

func Warn(msg string, args ...any) {
	if len(args) == 0 {
		Logger.Warn(msg)
	} else {
		Logger.Warn(fmt.Sprintf(msg, args...))
	}
}

func Error(msg string, args ...any) {
	if len(args) == 0 {
		Logger.Error(msg)
	} else {
		Logger.Error(fmt.Sprintf(msg, args...))
	}
}
