const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://localhost:3001";

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({
      success: false,
      error: "Invalid backend response",
    }));

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Backend request failed with status ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error(`API request failed for ${path}:`, error);

    return {
      success: false,
      error:
        "Could not connect to backend. Confirm the backend is running and VITE_API_URL is correct.",
    };
  }
}

export async function registerUser(username, wallet) {
  return apiRequest("/register", {
    method: "POST",
    body: JSON.stringify({ username, wallet }),
  });
}

export async function resolveUser(input) {
  return apiRequest("/resolve", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export async function getAllUsers() {
  return apiRequest("/users");
}

export { API_URL };