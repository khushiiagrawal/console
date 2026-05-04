package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
)

func TestListFeatureRequests(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{})

	userID := uuid.New()
	app.Get("/api/feedback/requests", func(c *fiber.Ctx) error {
		c.Locals("userID", userID)
		return handler.ListFeatureRequests(c)
	})

	t.Run("Success", func(t *testing.T) {
		mockRequests := []models.FeatureRequest{
			{ID: uuid.New(), Title: "Triaged Request", Status: models.RequestStatusTriageAccepted},
			{ID: uuid.New(), Title: "Untriaged Request", Status: models.RequestStatusOpen},
		}
		mockStore.On("GetUserFeatureRequests", userID, 0, 0).Return(mockRequests, nil)
		mockStore.On("CountUserPendingFeatureRequests", userID).Return(1, nil)

		req := httptest.NewRequest("GET", "/api/feedback/requests", nil)
		resp, _ := app.Test(req)

		assert.Equal(t, http.StatusOK, resp.StatusCode)
		var result struct {
			Items         []models.FeatureRequest `json:"items"`
			Total         int                     `json:"total"`
			PendingReview int                     `json:"pending_review"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		
		// Should only return triaged requests
		assert.Len(t, result.Items, 1)
		assert.Equal(t, "Triaged Request", result.Items[0].Title)
		assert.Equal(t, 2, result.Total)
		assert.Equal(t, 1, result.PendingReview)
	})
}

func TestCheckPreviewStatus(t *testing.T) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	// Set a token so it doesn't return "unavailable"
	handler := NewFeedbackHandler(mockStore, FeedbackConfig{GitHubToken: "token"})

	app.Get("/api/feedback/requests/preview/:pr_number", handler.CheckPreviewStatus)

	t.Run("InvalidPRNumber", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/feedback/requests/preview/abc", nil)
		resp, _ := app.Test(req)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	})
}
