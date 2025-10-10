package handlers

import (
	"net/http"

	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/gin-gonic/gin"
)

func HandleIndex(c *gin.Context) {
	logger.Info("Received request")

	menuService, err := config.MenuService()
	if err != nil {
		logger.ErrorErr("Error getting menu service", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error",
		})
		return
	}

	peonyMenu, err := menuService.GetPeonyMenu()
	if err != nil {
		logger.ErrorErr("Error getting Peony menu", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error",
		})
		return
	}

	azileaMenu, err := menuService.GetAzileaMenu()
	if err != nil {
		logger.ErrorErr("Error getting Azilea menu", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Internal server error",
		})
		return
	}

	c.HTML(200, "index.html", map[string]*menu.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
