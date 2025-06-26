package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

func LoadEnv() error {
	godotenv.Load(".env")

	return nil
}

func GetEnv(key string) (string, error) {
	env := os.Getenv(key)
	if env == "" {
		return "", fmt.Errorf("environment variable %s is not set", key)
	}
	return env, nil
}
