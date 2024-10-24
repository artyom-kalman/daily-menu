package main

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
	"github.com/artyom-kalman/kbu-daily-menu/internal/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/http"
)

func main() {
	config.Fabric("data/daily-menu.db", cafeteria.PEONY_URL, cafeteria.AZILEA_URL)
	// telegram.RunBot()

	http.Run()
}
