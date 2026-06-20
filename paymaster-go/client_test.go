package fluid

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRequestFeeBump(t *testing.T) {
	// Mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/fee-bump", r.URL.Path)
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
		assert.Equal(t, "test-api-key", r.Header.Get("x-api-key"))

		var req FeeBumpRequest
		err := json.NewDecoder(r.Body).Decode(&req)
		assert.NoError(t, err)
		assert.Equal(t, "test-xdr", req.XDR)

		resp := FeeBumpResponse{
			XDR:    "bumped-xdr",
			Status: "ready",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-api-key")
	resp, err := client.RequestFeeBump(context.Background(), "test-xdr", false)

	assert.NoError(t, err)
	assert.Equal(t, "bumped-xdr", resp.XDR)
	assert.Equal(t, "ready", resp.Status)
}

func TestRequestFeeBump_Error(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		errResp := ErrorResponse{
			Error: "Invalid XDR",
			Code:  "INVALID_XDR",
		}
		json.NewEncoder(w).Encode(errResp)
	}))
	defer server.Close()

	client := NewClient(server.URL, "")
	resp, err := client.RequestFeeBump(context.Background(), "bad-xdr", false)

	assert.Error(t, err)
	assert.Nil(t, resp)
	assert.Contains(t, err.Error(), "INVALID_XDR")
	assert.Contains(t, err.Error(), "Invalid XDR")
}
