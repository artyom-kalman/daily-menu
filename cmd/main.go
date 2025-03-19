package main

import (
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/api/rest"
	"github.com/artyom-kalman/kbu-daily-menu/api/telegram"
	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

func main() {
	logger.InitLogger()

	err := config.LoadEnv()
	if err != nil {
		logger.Error("error loading .env: %v", err)
		return
	}

	databasePath := "data/daily-menu.db"

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

	telegram.RunBot()

	rest.SetupRouts()

	port, err := config.GetEnv("PORT")
	if err != nil {
		logger.Error("error getting PORT: %v", err)
		return
	}

	logger.Info("Server is running on %s", port)
	err = http.ListenAndServe(":"+port, nil)
	if err != nil {
		logger.Error("error starting server: %v", err)
		return
	}
}
