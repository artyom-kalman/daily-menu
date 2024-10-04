package telegram

import tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"

type Bot struct {
	bot *tgbotapi.BotAPI
}

func NewBot(token string) (*Bot, error) {
	bot, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, err
	}

	return &Bot{
		bot: bot,
	}, nil
}

func (b *Bot) HandleMessages(text string) error {
	updateConf := tgbotapi.NewUpdate(0)
	updateConf.Timeout = 60

	updates := b.bot.GetUpdatesChan(updateConf)
	for update := range updates {
		if update.Message == nil {
			continue
		}

		msg := tgbotapi.NewMessage(update.Message.Chat.ID, text)
		_, err := b.bot.Send(msg)
		if err != nil {
			return err
		}
	}
	return nil
}
