# Shopify MCP Server

A comprehensive [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the Shopify Admin API. Connect Claude (or any MCP client) to your Shopify store to manage products, orders, customers, inventory, metaobjects, discounts, and more.

## Features

- **Products** — list, create, update, delete, publish/unpublish, variants CRUD, images, metafields
- **Collections** — custom & smart collections, add products, list collection products
- **Orders** — list, get, create, update, cancel, close, fulfill, refund, transactions
- **Draft Orders** — list, create, complete
- **Customers** — list, search, get, create, update, delete, customer order history
- **Inventory** — locations, get/adjust/set inventory levels
- **Metaobjects** — definitions (list/create) and entries (list/create/update/delete) via GraphQL
- **Metafields** — get/set on any resource (products, orders, customers, collections, shop, etc.)
- **Discounts** — price rules and discount codes (list, create, delete)
- **Reports** — sales summary, orders/customers/products counts
- **Pages & Blogs** — list pages, create/update pages, list blogs, create articles
- **Webhooks** — list, create, delete

## Installation

### npx (recommended)

```json
{
  "mcpServers": {
    "shopify": {
      "command": "npx",
      "args": ["-y", "github:slackermafia/Shopify-MCP-Server"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Clone & run locally

```bash
git clone https://github.com/slackermafia/Shopify-MCP-Server.git
cd Shopify-MCP-Server
npm install
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com \
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxx \
node src/index.js
```

## Configuration

| Environment Variable    | Description                              |
|------------------------|------------------------------------------|
| `SHOPIFY_STORE_DOMAIN` | Your store domain, e.g. `store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Shopify Admin API access token           |

### Getting an Access Token

1. Go to your Shopify Admin → **Settings → Apps and sales channels → Develop apps**
2. Create a private app and grant it the Admin API scopes you need
3. Copy the **Admin API access token**

**Recommended scopes:** `read_products`, `write_products`, `read_orders`, `write_orders`, `read_customers`, `write_customers`, `read_inventory`, `write_inventory`, `read_price_rules`, `write_price_rules`, `read_discounts`, `write_discounts`, `read_content`, `write_content`, `read_metaobjects`, `write_metaobjects`

## Available Tools (68)

### Shop
| Tool | Description |
|------|-------------|
| `get_shop_info` | Get store name, domain, currency, plan info |

### Products
| Tool | Description |
|------|-------------|
| `list_products` | List products with filters (status, vendor, type, collection) |
| `get_product` | Get a product by ID with all variants and images |
| `create_product` | Create a product with variants, options, images, and metafields |
| `update_product` | Update title, description, vendor, status, tags |
| `delete_product` | Permanently delete a product |
| `publish_product` | Publish or unpublish a product |
| `list_product_variants` | List all variants for a product |
| `create_product_variant` | Add a new variant (price, SKU, options, inventory) |
| `update_product_variant` | Update a variant's price, SKU, weight, options |
| `delete_product_variant` | Remove a variant from a product |
| `get_product_metafields` | Get metafields on a product |
| `set_product_metafield` | Create or update a metafield on a product |
| `add_product_image` | Add an image to a product by URL |

### Collections
| Tool | Description |
|------|-------------|
| `list_collections` | List all custom and smart collections |
| `get_collection` | Get a collection by ID |
| `create_collection` | Create a new custom collection |
| `update_collection` | Update collection title, description, sort order |
| `add_product_to_collection` | Add a product to a custom collection |
| `list_collection_products` | List products in a collection |

### Orders
| Tool | Description |
|------|-------------|
| `list_orders` | List orders with status/financial/fulfillment filters |
| `get_order` | Get full order details |
| `create_order` | Create an order programmatically |
| `update_order` | Update order note, tags, email, shipping address |
| `cancel_order` | Cancel with reason, optional restock and refund |
| `close_order` | Mark order as closed |
| `fulfill_order` | Create a fulfillment with tracking info |
| `create_refund` | Refund line items or shipping |
| `get_order_transactions` | Get all payment transactions |

### Draft Orders
| Tool | Description |
|------|-------------|
| `list_draft_orders` | List draft orders |
| `create_draft_order` | Create a draft order with custom discounts |
| `complete_draft_order` | Convert draft to a live order |

### Customers
| Tool | Description |
|------|-------------|
| `list_customers` | List all customers |
| `search_customers` | Search by name, email, or phone |
| `get_customer` | Get customer by ID |
| `create_customer` | Create a new customer with addresses |
| `update_customer` | Update customer details |
| `delete_customer` | Delete a customer |
| `get_customer_orders` | Get order history for a customer |

### Inventory
| Tool | Description |
|------|-------------|
| `list_locations` | List all fulfillment locations |
| `get_inventory_levels` | Get inventory by location or item |
| `adjust_inventory` | Relative adjustment (+/-) to inventory |
| `set_inventory_level` | Set absolute inventory quantity |

### Discounts
| Tool | Description |
|------|-------------|
| `list_price_rules` | List all price rules |
| `create_price_rule` | Create a price rule (fixed amount or percentage) |
| `create_discount_code` | Create a discount code for a price rule |
| `list_discount_codes` | List codes for a price rule |
| `delete_discount_code` | Delete a discount code |

### Metaobjects (GraphQL)
| Tool | Description |
|------|-------------|
| `list_metaobject_definitions` | List all metaobject definitions (content types) |
| `create_metaobject_definition` | Create a new metaobject definition with fields |
| `list_metaobjects` | List metaobject entries by type |
| `create_metaobject` | Create a new metaobject entry |
| `update_metaobject` | Update metaobject fields |
| `delete_metaobject` | Delete a metaobject entry |

### Metafields (Generic)
| Tool | Description |
|------|-------------|
| `list_metafields` | List metafields on any resource |
| `set_metafield` | Create/update a metafield on any resource |

### Reports & Analytics
| Tool | Description |
|------|-------------|
| `get_sales_report` | Revenue, order count, AOV for a date range |
| `get_orders_count` | Count orders with filters |
| `get_customers_count` | Total customer count |
| `get_products_count` | Total product count |

### Pages & Blogs
| Tool | Description |
|------|-------------|
| `list_pages` | List storefront pages |
| `create_page` | Create a new page |
| `update_page` | Update a page |
| `list_blogs` | List all blogs |
| `create_article` | Create a blog article |

### Webhooks
| Tool | Description |
|------|-------------|
| `list_webhooks` | List all webhook subscriptions |
| `create_webhook` | Create a new webhook (e.g. orders/create) |
| `delete_webhook` | Delete a webhook |

## Requirements

- Node.js 18+
- Shopify store with Admin API access

## A note on Shopify's REST API

Shopify marked the REST Admin API as **legacy as of October 1, 2024**, with new public apps required to use GraphQL exclusively from April 2025 onward. This server uses the latest stable REST API version (`2026-01`) for broad compatibility with private/custom apps and is fully functional. The metaobjects feature already uses GraphQL. Future versions of this server may migrate remaining endpoints to GraphQL.

## License

MIT
