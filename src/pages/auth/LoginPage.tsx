import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Eye, EyeOff, Info } from 'lucide-react'
import {
  consumeLogoutReason,
  setTrustedDevice,
  isTrustedDevice,
  LOGOUT_REASON_MESSAGES,
} from '@/lib/sessionPolicy'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  // The password is trimmed before validation so a trailing newline from a
  // password manager paste cannot silently cause a failed sign-in.
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { signIn } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(() => isTrustedDevice())

  // Read the reason for the previous sign-out exactly once, on first render.
  const logoutReason = useMemo(() => consumeLogoutReason(), [])
  const logoutMessage =
    logoutReason && logoutReason !== 'manual' ? LOGOUT_REASON_MESSAGES[logoutReason] : null

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      // Persisted BEFORE sign-in so the session-start stamp written by the
      // sign-in handler is evaluated against the correct absolute lifetime.
      setTrustedDevice(rememberDevice)
      await signIn.mutateAsync({
        email: data.email.trim(),
        password: data.password.trim(),
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Enter your credentials to sign in to your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logoutMessage && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{logoutMessage}</span>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        className="pr-10 font-mono"
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember-device"
                  checked={rememberDevice}
                  onCheckedChange={(checked) => setRememberDevice(checked === true)}
                />
                <Label
                  htmlFor="remember-device"
                  className="cursor-pointer text-sm font-normal text-muted-foreground"
                >
                  Keep me signed in on this device
                </Label>
              </div>
              <Link
                to="/forgot-password"
                className="shrink-0 text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <p className="text-xs text-muted-foreground">
              You are signed out automatically after a period of inactivity.
              Leave the box unticked on shared or public computers.
            </p>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>

        <div className="mt-6 text-center">
          <Link
            to="/portal/login"
            className="text-sm text-muted-foreground hover:text-primary"
          >
            Client Portal Login
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
