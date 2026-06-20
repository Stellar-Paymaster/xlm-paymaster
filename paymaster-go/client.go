package fluid

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/stellar/go/txnbuild"
)

// Client represents a Fluid fee-bump client.
type Client struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
}

// NewClient initializes a new Fluid client.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL:    baseURL,
		APIKey:     apiKey,
		HTTPClient: &http.Client{},
	}
}

// FeeBumpRequest defines the payload for asking the server to fee-bump a transaction.
type FeeBumpRequest struct {
	XDR    string `json:"xdr"`
	Submit bool   `json:"submit,omitempty"`
	Token  string `json:"token,omitempty"`
}

// FeeBumpResponse defines the result returned by the Fluid server.
type FeeBumpResponse struct {
	XDR      string `json:"xdr"`
	Status   string `json:"status"`
	Hash     string `json:"hash,omitempty"`
	FeePayer string `json:"fee_payer,omitempty"`
}

// ErrorResponse represents an error returned by the Fluid server.
type ErrorResponse struct {
	Error   string `json:"error"`
	Status  int    `json:"status"`
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
}

// RequestFeeBump sends a signed transaction XDR to the Fluid server to be fee-bumped.
func (c *Client) RequestFeeBump(ctx context.Context, signedXDR string, submit bool) (*FeeBumpResponse, error) {
	return c.RequestFeeBumpWithToken(ctx, signedXDR, submit, "")
}

// RequestFeeBumpWithToken sends a signed transaction XDR with an optional payment token.
func (c *Client) RequestFeeBumpWithToken(ctx context.Context, signedXDR string, submit bool, token string) (*FeeBumpResponse, error) {
	reqBody := FeeBumpRequest{
		XDR:    signedXDR,
		Submit: submit,
		Token:  token,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", fmt.Sprintf("%s/fee-bump", c.BaseURL), bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("x-api-key", c.APIKey)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errResp ErrorResponse
		if err := json.Unmarshal(bodyBytes, &errResp); err != nil {
			return nil, fmt.Errorf("server returned error %d: %s", resp.StatusCode, string(bodyBytes))
		}
		errMsg := errResp.Error
		if errResp.Message != "" {
			errMsg = errResp.Message
		}
		return nil, fmt.Errorf("fluid server error (%s): %s (status %d)", errResp.Code, errMsg, resp.StatusCode)
	}

	var feeBumpResp FeeBumpResponse
	if err := json.Unmarshal(bodyBytes, &feeBumpResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &feeBumpResp, nil
}

// BuildAndRequestFeeBump takes a signed txnbuild.Transaction and requests a fee-bump.
func (c *Client) BuildAndRequestFeeBump(ctx context.Context, tx *txnbuild.Transaction, submit bool) (*FeeBumpResponse, error) {
	xdr, err := tx.Base64()
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction XDR: %w", err)
	}
	return c.RequestFeeBump(ctx, xdr, submit)
}
