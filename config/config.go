package config

import (
	"errors"
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

func LoadEnv() error {
	_, err := os.Stat(".env")
	if err != nil {
		return errors.New("failed to find .env file")
	}

	err = godotenv.Load(".env")
	if err != nil {
		return errors.New("failed to load .env file")
	}

	return nil
}

func GetEnv(key string) (string, error) {
	env := os.Getenv(key)
	if env == "" {
		return "", fmt.Errorf("environment variable %s is not set", key)
	}
	return env, nil
}
