package handlers

import (
	"log/slog"

	"github.com/artyom-kalman/kbu-daily-menu/internal/menu"
	"github.com/gin-gonic/gin"
)

type MenuService interface {
	GetPeonyMenu() (*menu.Menu, error)
	GetAzileaMenu() (*menu.Menu, error)
}

func HandleIndex(menuService MenuService) gin.HandlerFunc {
	return func(c *gin.Context) {
		slog.Info("Received request")

		var peonyMenu, azileaMenu *menu.Menu

		if menuService != nil {
			var err error
			peonyMenu, err = menuService.GetPeonyMenu()
			if err != nil {
				slog.Error("Error getting Peony menu", "error", err)
				peonyMenu = nil
			}

			azileaMenu, err = menuService.GetAzileaMenu()
			if err != nil {
				slog.Error("Error getting Azilea menu", "error", err)
				azileaMenu = nil
			}
		}

		c.HTML(200, "index.html", map[string]*menu.Menu{
			"Peony":  peonyMenu,
			"Azilea": azileaMenu,
		})
	}
}
