import { Bot, LoaderCircle } from "lucide-react"
import { Navigate, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/context/AuthContext"

interface SignInLocationState {
  from?: {
    pathname?: string
    search?: string
  }
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="currentColor"
        d="M21.35 12.2c0-.74-.07-1.46-.19-2.15H12v4.07h5.24a4.48 4.48 0 0 1-1.94 2.94v2.64h3.14c1.84-1.69 2.91-4.18 2.91-7.5Z"
      />
      <path
        fill="currentColor"
        d="M12 21.7c2.62 0 4.82-.87 6.43-2.36l-3.14-2.64c-.87.58-1.99.93-3.29.93-2.53 0-4.67-1.71-5.44-4.01H3.32v2.73A9.7 9.7 0 0 0 12 21.7Z"
      />
      <path
        fill="currentColor"
        d="M6.56 13.62A5.83 5.83 0 0 1 6.25 12c0-.56.11-1.1.31-1.62V7.65H3.32A9.7 9.7 0 0 0 2.3 12c0 1.56.37 3.04 1.02 4.35l3.24-2.73Z"
      />
      <path
        fill="currentColor"
        d="M12 6.37c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.34 9.34 0 0 0 12 2.3a9.7 9.7 0 0 0-8.68 5.35l3.24 2.73c.77-2.3 2.91-4.01 5.44-4.01Z"
      />
    </svg>
  )
}

export default function SignIn() {
  const { status, signInWithGoogle } = useAuth()
  const location = useLocation()
  const state = location.state as SignInLocationState | null
  const destination = `${state?.from?.pathname || "/"}${state?.from?.search || ""}`

  if (status === "authenticated") {
    return <Navigate to={destination} replace />
  }

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="flex min-h-svh flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-center gap-2 font-semibold md:justify-start">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="size-5" />
          </span>
          Companion
        </div>

        <div className="flex flex-1 items-center justify-center">
          <Card className="w-full max-w-md border-0 shadow-none sm:border sm:shadow-sm">
            <CardHeader className="space-y-3 text-center">
              <CardTitle className="text-2xl">Welcome to Companion</CardTitle>
              <CardDescription className="text-balance">
                Sign in with your Google account to access your agentic organization workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={status === "loading"}
                onClick={() => void signInWithGoogle()}
              >
                {status === "loading" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                {status === "loading" ? "Preparing sign-in..." : "Continue with Google"}
              </Button>
              <p className="mt-6 text-center text-xs text-muted-foreground">
                By continuing, you agree to use Companion according to your organization&apos;s
                access policies.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="relative hidden bg-muted lg:block">
        <img
          src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1800&q=85"
          alt="A collaborative team working together in a modern workspace"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.45] dark:grayscale"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-10 pt-32 text-white">
          <p className="max-w-xl text-2xl font-medium text-balance">
            Turn ideas into coordinated action with an AI-powered organization.
          </p>
        </div>
      </div>
    </div>
  )
}
