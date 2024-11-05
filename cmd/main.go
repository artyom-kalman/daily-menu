package main

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
	"github.com/artyom-kalman/kbu-daily-menu/internal/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/http"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/telegram"
)

func main() {
	config.InitApp("data/daily-menu.db", cafeteria.PEONY_URL, cafeteria.AZILEA_URL)

	telegram.RunBot()

	http.Run()
}
