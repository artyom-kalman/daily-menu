package main

import (
	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/handlers"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/gin-gonic/gin"
)

func main() {
	logger.InitLogger()

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

	// err = telegram.RunBot()
	// if err != nil {
	// 	logger.Error("error running bot: %v", err)
	// 	return
	// }

	router := gin.Default()
	router.LoadHTMLGlob("templates/*.html")
	router.StaticFile("/dist/tailwind.css", "./web/dist/tailwind.css")
	router.Static("/img", "./web/img")
	router.GET("/", handlers.HandleIndex)

	port, err := config.GetEnv("PORT")
	if err != nil {
		logger.Error("error getting PORT: %v", err)
		return
	}

	logger.Info("Server is running on %s", port)
	err = router.Run(":" + port)
	if err != nil {
		logger.Error("error starting server: %v", err)
		return
	}
}
