package main

import (
	"context"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/bot"
	"github.com/artyom-kalman/kbu-daily-menu/internal/database"
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
		logger.ErrorErr("Application failed", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := loadConfig()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	db := database.NewDatabase(cfg.DatabasePath)
	if err := db.Connect(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	defer db.Close()

	if err := config.InitApp(cfg.DatabasePath, cfg.PeonyURL, cfg.AzileaURL); err != nil {
		return fmt.Errorf("failed to initialize app: %w", err)
	}

	migrator := database.NewMigrator(db)
	migrationPath := config.GetEnvWithDefault("MIGRATION_PATH", "database/migrations")
	// dir := filepath.Dir(migrationPath)
	// subdir := filepath.Base(migrationPath)
	if err := migrator.LoadMigrationsFromFS(os.DirFS("./"), "migrations"); err != nil {
		return fmt.Errorf("failed to load migrations from %s: %w", migrationPath, err)
	}
	if err := migrator.Up(); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	botRepo := bot.NewSubscriptionRepository(db)
	botInstance, err := bot.NewBot(cfg.TelegramBotToken, botRepo)
	if err != nil {
		return fmt.Errorf("failed to create bot: %w", err)
	}

	go func() {
		if err := botInstance.Run(); err != nil {
			logger.ErrorErr("Bot failed to run", err)
		}
	}()

	app := &App{}
	app.setupRouter()
	app.setupServer(cfg.Port)

	errChan := make(chan error, 1)
	go func() {
		logger.InfoWithFields("Starting server", slog.String("port", cfg.Port))
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
		"spicinessIndicators": func(spiciness int) []string {
			indicators := make([]string, 5)
			for i := 0; i < 5; i++ {
				if i < spiciness {
					indicators[i] = "bg-red-500"
				} else {
					indicators[i] = "bg-gray-300"
				}
			}
			return indicators
		},
		"debugType": func(v interface{}) string {
			return fmt.Sprintf("%T", v)
		},
		"formatDate": func(t time.Time) string {
			return t.Format("02.01.2006")
		},
		"formatTime": func(t time.Time) string {
			return t.Format("15:04")
		},
	})
	a.router.LoadHTMLGlob("templates/*.html")

	a.setupRoutes()
}

func (a *App) setupRoutes() {
	a.router.GET("/up", healthCheckHandler)

	a.router.StaticFile("/dist/tailwind.css", "./web/dist/tailwind.css")
	a.router.StaticFile("/dist/app.js", "./web/dist/app.js")
	a.router.Static("/static", "./web/static")
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
		logger.InfoWithFields("Received signal, shutting down server", slog.String("signal", sig.String()))
		return a.gracefulShutdown()
	}
}

func (a *App) gracefulShutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := a.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server forced to shutdown: %w", err)
	}

	logger.Info("Server shutdown complete")
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
