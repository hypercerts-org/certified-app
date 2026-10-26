"use client"

// @hypercerts-org/ui-react 0.2.0 ships without a "use client" directive, and
// several of its components use hooks, so Server Components cannot import it
// directly. This module marks the boundary once. Remove it when the package
// declares its own client boundary.
export {
  Avatar,
  Badge,
  Button,
  Card,
  Container,
  EmptyState,
  ErrorMessage,
  Eyebrow,
  Heading,
  IdentityRow,
  SearchInput,
  Separator,
  Skeleton,
  Text,
  UIProvider,
} from "@hypercerts-org/ui-react"
