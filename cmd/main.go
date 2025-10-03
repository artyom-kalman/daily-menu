package main

import (
	"context"
	"fmt"
	"html/template"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/bot"
	"github.com/artyom-kalman/kbu-daily-menu/internal/http/handlers"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/gin-gonic/gin"
)

const (
	defaultPort     = "8080"
	defaultDBPath   = "./database/daily-menu.db"
	shutdownTimeout = 10 * time.Second
	readTimeout     = 15 * time.Second
	writeTimeout    = 15 * time.Second
	idleTimeout     = 60 * time.Second
)

type App struct {
	router *gin.Engine
	server *http.Server
}

func main() {
	if err := run(); err != nil {
		logger.Error("application failed: %v", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	if err := config.InitApp(cfg.DatabasePath, cfg.PeonyURL, cfg.AzileaURL); err != nil {
		return fmt.Errorf("failed to initialize app: %w", err)
	}

	botInstance, err := bot.NewBot(cfg.TelegramBotToken)
	if err != nil {
		return fmt.Errorf("failed to create bot: %w", err)
	}

	go func() {
		if err := botInstance.Run(); err != nil {
			logger.Error("bot failed to run: %v", err)
		}
	}()

	app := &App{}
	app.setupRouter()
	app.setupServer(cfg.Port)

	errChan := make(chan error, 1)
	go func() {
		logger.Info("starting server on port %s", cfg.Port)
		if err := app.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- fmt.Errorf("server failed to start: %w", err)
		}
	}()

	return app.waitForShutdown(errChan)
}

type Config struct {
	Port             string
	DatabasePath     string
	PeonyURL         string
	AzileaURL        string
	TelegramBotToken string
}

func loadConfig() (*Config, error) {
	if err := config.LoadEnv(); err != nil {
		return nil, fmt.Errorf("failed to load .env: %w", err)
	}

	peonyURL, err := config.GetEnv("PEONY_URL")
	if err != nil {
		return nil, fmt.Errorf("failed to get PEONY_URL: %w", err)
	}

	azileaURL, err := config.GetEnv("AZILEA_URL")
	if err != nil {
		return nil, fmt.Errorf("failed to get AZILEA_URL: %w", err)
	}

	telegramBotToken, err := config.GetEnv("TELEGRAM_BOT_TOKEN")
	if err != nil {
		return nil, fmt.Errorf("failed to get TELEGRAM_BOT_TOKEN: %w", err)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	return &Config{
		Port:             port,
		DatabasePath:     defaultDBPath,
		PeonyURL:         peonyURL,
		AzileaURL:        azileaURL,
		TelegramBotToken: telegramBotToken,
	}, nil
}

func (a *App) setupRouter() {
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	a.router = gin.New()

	a.router.Use(gin.Logger())
	a.router.Use(gin.Recovery())
	a.router.Use(corsMiddleware())

	a.router.SetFuncMap(template.FuncMap{
		"iterate": func(count int) []struct{} {
			return make([]struct{}, count)
		},
	})
	a.router.LoadHTMLGlob("templates/*.html")

	a.setupRoutes()
}

func (a *App) setupRoutes() {
	a.router.GET("/up", healthCheckHandler)

	a.router.StaticFile("/dist/tailwind.css", "./web/dist/tailwind.css")
	a.router.Static("/img", "./web/img")

	webGroup := a.router.Group("")
	{
		webGroup.GET("/", handlers.HandleIndex)
	}

	if gin.Mode() != gin.ReleaseMode {
		a.router.GET("/debug/pprof/*any", gin.WrapH(http.DefaultServeMux))
	}
}

func (a *App) setupServer(port string) {
	a.server = &http.Server{
		Addr:         ":" + port,
		Handler:      a.router,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}
}

func (a *App) waitForShutdown(errChan chan error) error {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errChan:
		return err
	case sig := <-quit:
		logger.Info("received signal %v, shutting down server...", sig)
		return a.gracefulShutdown()
	}
}

func (a *App) gracefulShutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := a.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server forced to shutdown: %w", err)
	}

	logger.Info("server shutdown complete")
	return nil
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func healthCheckHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"timestamp": time.Now().UTC(),
	})
}

func statusHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"service": "kbu-daily-menu",
		"version": "1.0.0",
	})
}
