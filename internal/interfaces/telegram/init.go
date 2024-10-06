package telegram

import (
	"log"
	"os"

	"github.com/artyom-kalman/kbu-daily-menu/internal/application/bot"
)

func RunBot() {
	token := os.Getenv("KBUDAILYMENU_TGBOT_TOKEN")
	if token == "" {
		log.Fatal("Set env variable")
	}

	bot, err := bot.NewBot(token)
	if err != nil {
		log.Fatal(err)
	}

	myChatId := 734130728
	bot.ScheduleDailyMenu(myChatId, "HEllo", "10:00")

	go bot.HandleMessages("Hello! I am a menu bot.")
}
