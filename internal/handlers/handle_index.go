package handlers

import (
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/domain"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/gin-gonic/gin"
)

func HandleIndex(c *gin.Context) {
	logger.Info("Received request")

	menuService, err := config.MenuService()
	if err != nil {
		logger.Error("error get menu service: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error",
		})
		return
	}

	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		logger.Error("error getting Peony menu: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error",
		})
		return
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		logger.Error("error getting Azilea menu: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error",
		})
		return
	}

	c.HTML(200, "index.html", map[string]*domain.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
