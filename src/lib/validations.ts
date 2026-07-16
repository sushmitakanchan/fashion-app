import { z } from "zod";

/**
 * Shared Zod schemas. Because they live in a plain module they can be reused on
 * the client (React Hook Form) and on the server (Route Handlers / actions).
 */

export const newsletterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name")
    .max(60, "That name is a little too long"),
  email: z.email("Enter a valid email address"),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only"),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().positive("Price must be greater than 0"),
  currency: z.string().length(3).default("USD"),
  stock: z.coerce.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  sizes: z.array(z.string()).default([]),
  colors: z.array(z.string()).default([]),
});

export type ProductInput = z.infer<typeof productSchema>;
