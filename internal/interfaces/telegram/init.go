package telegram

import (
	"os"

	"github.com/artyom-kalman/kbu-daily-menu/internal/application/bot"
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
	"github.com/artyom-kalman/kbu-daily-menu/internal/config"
)

func RunBot() {
	token := os.Getenv("KBUDAILYMENU_TGBOT_TOKEN")
	if token == "" {
		panic("Set bot token")
	}

	bot, err := bot.NewBot(token)
	if err != nil {
		panic(err)
	}

	menuService := config.Fabric("data/daily-menu.db", cafeteria.PEONY_URL, cafeteria.AZILEA_URL)

	message, err := menuService.GetMenuString()
	if err != nil {
		message = "Произошла ошибка"
	}
	myChatId := 734130728
	bot.ScheduleDailyMenu(myChatId, message, "10:00")

	go bot.HandleMessages(message)
}
