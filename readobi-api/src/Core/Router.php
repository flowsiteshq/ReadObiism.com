<?php
namespace Alg\Core;

/**
 * ALG Studio Engine - Universal REST API Router & Middleware Pipeline
 * 
 * Central routing engine supporting dynamic URL parameter matching (/users/{id}),
 * HTTP verb dispatches, middleware pipelines, and structured error responses.
 */
class Router {
    private array $routes = [];
    private string $groupPrefix = '';
    private array $groupMiddleware = [];

    /**
     * Group routes under a common path prefix and middleware stack
     */
    public function group(string $prefix, array $options, callable $callback): void {
        $previousPrefix = $this->groupPrefix;
        $previousMiddleware = $this->groupMiddleware;

        $this->groupPrefix = $previousPrefix . '/' . trim($prefix, '/');
        $this->groupMiddleware = array_merge($previousMiddleware, $options['middleware'] ?? []);

        $callback($this);

        $this->groupPrefix = $previousPrefix;
        $this->groupMiddleware = $previousMiddleware;
    }

    public function get(string $path, $handler, array $middleware = []): void {
        $this->addRoute('GET', $path, $handler, $middleware);
    }

    public function post(string $path, $handler, array $middleware = []): void {
        $this->addRoute('POST', $path, $handler, $middleware);
    }

    public function put(string $path, $handler, array $middleware = []): void {
        $this->addRoute('PUT', $path, $handler, $middleware);
    }

    public function delete(string $path, $handler, array $middleware = []): void {
        $this->addRoute('DELETE', $path, $handler, $middleware);
    }

    private function addRoute(string $method, string $path, $handler, array $middleware = []): void {
        $fullPath = rtrim($this->groupPrefix . '/' . trim($path, '/'), '/');
        if (empty($fullPath)) {
            $fullPath = '/';
        }

        $allMiddleware = array_merge($this->groupMiddleware, $middleware);

        // Convert {param} placeholders into regex match groups
        $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[^/]+)', $fullPath);
        $pattern = '#^' . $pattern . '$#';

        $this->routes[] = [
            'method' => strtoupper($method),
            'path' => $fullPath,
            'pattern' => $pattern,
            'handler' => $handler,
            'middleware' => $allMiddleware
        ];
    }

    /**
     * Dispatches incoming HTTP request to matching route handler
     */
    public function dispatch(string $method, string $uri): void {
        $path = parse_url($uri, PHP_URL_PATH);
        $path = '/' . trim($path, '/');

        foreach ($this->routes as $route) {
            if ($route['method'] !== strtoupper($method)) {
                continue;
            }

            if (preg_match($route['pattern'], $path, $matches)) {
                // Filter named parameters
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

                // Execute middleware stack
                foreach ($route['middleware'] as $mw) {
                    if (!$this->executeMiddleware($mw)) {
                        return;
                    }
                }

                // Execute handler (Closure or Controller class)
                if (is_callable($route['handler'])) {
                    call_user_func_array($route['handler'], [$params]);
                } elseif (is_array($route['handler'])) {
                    [$class, $action] = $route['handler'];
                    $controller = new $class();
                    call_user_func_array([$controller, $action], [$params]);
                }
                return;
            }
        }

        // Return 404 JSON Envelope if no route matches
        http_response_code(404);
        echo json_encode([
            "success" => false,
            "error" => [
                "code" => "ROUTE_NOT_FOUND",
                "message" => "Endpoint {$method} {$path} does not exist."
            ],
            "timestamp" => date('c')
        ]);
    }

    private function executeMiddleware(string $middleware): bool {
        if ($middleware === 'auth') {
            $headers = getallheaders();
            $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
            if (empty($authHeader) || strpos($authHeader, 'Bearer ') !== 0) {
                http_response_code(401);
                echo json_encode([
                    "success" => false,
                    "error" => ["code" => "UNAUTHORIZED", "message" => "Missing or invalid Bearer token."]
                ]);
                return false;
            }
        }
        return true;
    }
}
