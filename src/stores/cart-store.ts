import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  image?: string;
  size?: string;
  color?: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
};

/** A line item is unique per product + size + color combination. */
export const cartItemKey = (
  item: Pick<CartItem, "productId" | "size" | "color">,
) => [item.productId, item.size ?? "", item.color ?? ""].join("__");

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      addItem: (incoming) =>
        set((state) => {
          const quantity = incoming.quantity ?? 1;
          const key = cartItemKey(incoming);
          const existing = state.items.find((i) => cartItemKey(i) === key);

          if (existing) {
            return {
              items: state.items.map((i) =>
                cartItemKey(i) === key
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }

          return { items: [...state.items, { ...incoming, quantity }] };
        }),
      removeItem: (key) =>
        set((state) => ({
          items: state.items.filter((i) => cartItemKey(i) !== key),
        })),
      updateQuantity: (key, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => cartItemKey(i) !== key)
              : state.items.map((i) =>
                  cartItemKey(i) === key ? { ...i, quantity } : i,
                ),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "fashion-cart",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// Derived selectors — pass to `useCartStore(selector)` so components only
// re-render when the derived value changes.
export const selectTotalItems = (state: CartState) =>
  state.items.reduce((sum, i) => sum + i.quantity, 0);

export const selectTotalPrice = (state: CartState) =>
  state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
