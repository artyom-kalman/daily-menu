package telegram

import (
	"log"
	"os"

	"github.com/artyom-kalman/kbu-daily-menu/internal/application/bot"
	"github.com/artyom-kalman/kbu-daily-menu/internal/cafeteria"
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

	menuService := cafeteria.NewMenuService(
		cafeteria.NewMenuRepository(
			cafeteria.NewMenuFetcher(),
		),
	)

	message, err := menuService.GetMenuString()
	if err != nil {
		message = "Произошла ошибка"
	}
	myChatId := 734130728
	bot.ScheduleDailyMenu(myChatId, message, "10:00")

	go bot.HandleMessages(message)
}
