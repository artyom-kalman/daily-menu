package main

import (
	"log"
	"os"

	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/rest"
	"github.com/artyom-kalman/kbu-daily-menu/internal/interfaces/telegram"
)

func main() {
	go func() {
		rest.SetupRouts()
		rest.StartServer()
	}()

	token := os.Getenv("KBUDAILYMENU_TGBOT_TOKEN")
	bot, err := telegram.NewBot(token)
	if err != nil {
		log.Fatal(err)
	}

	bot.HandleMessages("Hello")

	select {}
}
