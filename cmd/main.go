package main

import (
	"net/http"
	_ "net/http/pprof"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/handlers"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/gin-gonic/gin"
)

func main() {
	err := config.LoadEnv()
	if err != nil {
		logger.Error("error loading .env: %v", err)
		return
	}

	databasePath := "database/daily-menu.db"

	peonyUrl, err := config.GetEnv("PEONY_URL")
	if err != nil {
		logger.Error("error getting PEONY_URL: %v", err)
		return
	}

	azileanUrl, err := config.GetEnv("AZILEA_URL")
	if err != nil {
		logger.Error("error getting AZILEA_URL: %v", err)
		return
	}

	config.InitApp(databasePath, peonyUrl, azileanUrl)

	router := gin.Default()
	gin.SetMode(gin.DebugMode)

	router.LoadHTMLGlob("templates/*.html")

	menuGroup := router.Group("/menu")
	{
		menuGroup.StaticFile("/dist/tailwind.css", "./web/dist/tailwind.css")
		menuGroup.Static("/img", "./web/img")
		menuGroup.GET("/", handlers.HandleIndex)
		router.GET("/debug/pprof/*any", gin.WrapH(http.DefaultServeMux))
	}

	err = router.Run()
	if err != nil {
		logger.Error("error starting server: %v", err)
		return
	}
}
