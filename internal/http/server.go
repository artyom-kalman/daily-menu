package http

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/artyom-kalman/kbu-daily-menu/internal/http/handlers"
	"github.com/gin-gonic/gin"
)

const (
	shutdownTimeout = 10 * time.Second
	readTimeout     = 15 * time.Second
	writeTimeout    = 15 * time.Second
)

type Server struct {
	router    *gin.Engine
	server    *http.Server
	scheduler interface {
		Stop() error
	}
	menuService handlers.MenuService
}

func NewServer(scheduler interface {
	Stop() error
}, menuService handlers.MenuService) *Server {
	return &Server{
		scheduler:   scheduler,
		menuService: menuService,
	}
}

func (s *Server) SetupRouter() {
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	s.router = gin.New()

	s.router.Use(gin.Logger())
	s.router.Use(gin.Recovery())
	s.router.Use(CORSMiddleware())

	s.router.LoadHTMLGlob("templates/*.html")

	s.setupRoutes()
}

func (s *Server) setupRoutes() {
	s.router.GET("/up", healthCheckHandler)

	s.router.StaticFile("/dist/tailwind.css", "./web/dist/tailwind.css")
	s.router.StaticFile("/dist/app.js", "./web/dist/app.js")
	s.router.Static("/static", "./web/static")
	s.router.Static("/img", "./web/img")

	webGroup := s.router.Group("")
	{
		webGroup.GET("/", handlers.HandleIndex(s.menuService))
	}

	if gin.Mode() != gin.ReleaseMode {
		s.router.GET("/debug/pprof/*any", gin.WrapH(http.DefaultServeMux))
	}
}

func (s *Server) Start(port string) error {
	s.server = &http.Server{
		Addr:         ":" + port,
		Handler:      s.router,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
	}

	slog.Info("Starting server", "port", port)
	return s.server.ListenAndServe()
}

func (s *Server) WaitForShutdown(errChan chan error) error {
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errChan:
		return err
	case sig := <-quit:
		slog.Info("Received signal, shutting down server", "signal", sig.String())
		return s.GracefulShutdown()
	}
}

func (s *Server) GracefulShutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if s.scheduler != nil {
		if err := s.scheduler.Stop(); err != nil {
			slog.Error("Failed to stop scheduler", "error", err)
		}
	}

	if err := s.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("server forced to shutdown: %w", err)
	}

	slog.Info("Server shutdown complete")
	return nil
}

func healthCheckHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "ok",
		"timestamp": time.Now().UTC(),
	})
}
