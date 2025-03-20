package handlers

import (
	"html/template"
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
)

func HandleIndex(rw http.ResponseWriter, request *http.Request) {
	logger.Info("Received request")

	menuService, err := config.MenuService()
	if err != nil {
		logger.Error("error get menu service: %v", err)
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
		return
	}

	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		logger.Error("error getting Peony menu: %v", err)
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
		return
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		logger.Error("error getting Azilea menu: %v", err)
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
		return
	}

	tmpl, err := template.ParseFiles("templates/index.html")
	if err != nil {
		logger.Error("Error loading index template: %v", err)
		http.Error(rw, "Error loading the page", http.StatusInternalServerError)
		return
	}

	tmpl.Execute(rw, map[string]*domain.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
