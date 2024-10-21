package main

import (
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/http"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/telegram"
)

func main() {
	telegram.RunBot()

	http.Run()
}
