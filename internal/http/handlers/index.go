package handlers

import (
	"github.com/artyom-kalman/kbu-daily-menu/config"
	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/artyom-kalman/kbu-daily-menu/pkg/logger"
	"github.com/gin-gonic/gin"
)

func HandleIndex(c *gin.Context) {
	logger.Info("Received request")

	// Try to get menu service, but continue even if it fails
	var peonyMenu, azileaMenu *menu.Menu

	menuService, err := config.MenuService()
	if err != nil {
		logger.ErrorErr("Error getting menu service", err)
	} else {
		peonyMenu, err = menuService.GetPeonyMenu()
		if err != nil {
			logger.ErrorErr("Error getting Peony menu", err)
			peonyMenu = nil
		}

		azileaMenu, err = menuService.GetAzileaMenu()
		if err != nil {
			logger.ErrorErr("Error getting Azilea menu", err)
			azileaMenu = nil
		}
	}

	c.HTML(200, "index.html", map[string]*menu.Menu{
		"Peony":  peonyMenu,
		"Azilea": azileaMenu,
	})
}
