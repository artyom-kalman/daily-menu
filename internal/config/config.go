package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

func init() {
	godotenv.Load(".env")
}

type Config struct {
	Port             string
	DatabasePath     string
	MigrationPath    string
	PeonyURL         string
	AzileaURL        string
	TelegramBotToken string
	GPTURL           string
	GPTToken         string
}

func LoadConfig() (*Config, error) {
	peonyURL, err := GetEnv("PEONY_URL")
	if err != nil {
		return nil, fmt.Errorf("failed to get PEONY_URL: %w", err)
	}

	azileaURL, err := GetEnv("AZILEA_URL")
	if err != nil {
		return nil, fmt.Errorf("failed to get AZILEA_URL: %w", err)
	}

	telegramBotToken, err := GetEnv("TELEGRAM_BOT_TOKEN")
	if err != nil {
		return nil, fmt.Errorf("failed to get TELEGRAM_BOT_TOKEN: %w", err)
	}

	databasePath := GetEnvWithDefault("DATABASE_PATH", "./database/daily-menu.db")
	migrationPath := GetEnvWithDefault("MIGRATION_PATH", "migrations")

	port := GetEnvWithDefault("PORT", "8080")

	gptToken, err := GetEnv("GPT_TOKEN")
	if err != nil {
		return nil, err
	}

	gptURL, err := GetEnv("GPT_URL")
	if err != nil {
		return nil, err
	}

	return &Config{
		Port:             port,
		DatabasePath:     databasePath,
		MigrationPath:    migrationPath,
		PeonyURL:         peonyURL,
		AzileaURL:        azileaURL,
		TelegramBotToken: telegramBotToken,
		GPTToken:         gptToken,
		GPTURL:           gptURL,
	}, nil
}

func GetEnv(key string) (string, error) {
	env := os.Getenv(key)
	if env == "" {
		return "", fmt.Errorf("environment variable %s is not set", key)
	}
	return env, nil
}

func GetEnvWithDefault(key, defaultValue string) string {
	env := os.Getenv(key)
	if env == "" {
		return defaultValue
	}
	return env
}
