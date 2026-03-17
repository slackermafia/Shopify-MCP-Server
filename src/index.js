#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ─── Config ────────────────────────────────────────────────────────────────
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error(
    'ERROR: Missing required environment variables: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN'
  );
  process.exit(1);
}

const API_VERSION = '2026-01';
const BASE_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}`;
const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

// ─── HTTP Helpers ───────────────────────────────────────────────────────────
async function shopifyREST(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify REST ${res.status} on ${path}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function shopifyGQL(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (data.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

// ─── MCP Server ────────────────────────────────────────────────────────────
const server = new Server({
  name: 'Shopify MCP Server',
  version: '1.0.0',
  capabilities: {},
});

// ─────────────────────────────────────────────────────────────────────────────
// TOOLS
// ─────────────────────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // ─── Products ──────────────────────────────────────────────────────────────

  if (name === 'list_products') {
    const query = `
      query ($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const products = data.products.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(products, null, 2) }],
    };
  }

  if (name === 'get_product') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        product(id: $id) {
          id
          title
          handle
          description
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.product, null, 2) }],
    };
  }

  if (name === 'search_products') {
    const { query: searchQuery } = args;
    const query = `
      query ($query: String!) {
        products(first: 10, query: $query) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { query: searchQuery });
    const products = data.products.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(products, null, 2) }],
    };
  }

  if (name === 'create_product') {
    const { title, productType, vendor } = args;
    const mutation = `
      mutation ($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, {
      input: {
        title,
        productType: productType || '',
        vendor: vendor || '',
      },
    });
    if (data.productCreate.userErrors.length > 0) {
      throw new Error(`Product creation error: ${JSON.stringify(data.productCreate.userErrors)}`);
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.productCreate.product, null, 2),
        },
      ],
    };
  }

  if (name === 'delete_product') {
    const { id } = args;
    const mutation = `
      mutation ($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, { input: { id } });
    if (data.productDelete.userErrors.length > 0) {
      throw new Error(`Product deletion error: ${JSON.stringify(data.productDelete.userErrors)}`);
    }
    return {
      content: [{ type: 'text', text: `Product ${data.productDelete.deletedProductId} deleted` }],
    };
  }

  // ─── Product Images ────────────────────────────────────────────────────────

  if (name === 'list_product_images') {
    const { product_id } = args;
    const path = `/products/${product_id}/images.json`;
    const data = await shopifyREST(path);
    return {
      content: [{ type: 'text', text: JSON.stringify(data.images, null, 2) }],
    };
  }

  if (name === 'get_product_image') {
    const { product_id, image_id } = args;
    const path = `/products/${product_id}/images/${image_id}.json`;
    const data = await shopifyREST(path);
    return {
      content: [{ type: 'text', text: JSON.stringify(data.image, null, 2) }],
    };
  }

  if (name === 'create_product_image') {
    const { product_id, src } = args;
    const path = `/products/${product_id}/images.json`;
    const data = await shopifyREST(path, {
      method: 'POST',
      body: JSON.stringify({ image: { src } }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.image, null, 2) }],
    };
  }

  if (name === 'delete_product_image') {
    const { product_id, image_id } = args;
    const path = `/products/${product_id}/images/${image_id}.json`;
    await shopifyREST(path, { method: 'DELETE' });
    return {
      content: [{ type: 'text', text: `Image ${image_id} deleted` }],
    };
  }

  // ─── Orders ────────────────────────────────────────────────────────────────

  if (name === 'list_orders') {
    const query = `
      query ($first: Int!) {
        orders(first: $first) {
          edges {
            node {
              id
              name
              email
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const orders = data.orders.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(orders, null, 2) }],
    };
  }

  if (name === 'get_order') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        order(id: $id) {
          id
          name
          email
          createdAt
          lineItems(first: 10) {
            edges {
              node {
                id
                title
                quantity
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
          customer {
            id
            email
            firstName
            lastName
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.order, null, 2) }],
    };
  }

  // ─── Collections ──────────────────────────────────────────────────────────

  if (name === 'list_collections') {
    const query = `
      query ($first: Int!) {
        collections(first: $first) {
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const collections = data.collections.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(collections, null, 2) }],
    };
  }

  if (name === 'get_collection') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        collection(id: $id) {
          id
          title
          handle
          description
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.collection, null, 2) }],
    };
  }

  if (name === 'create_collection') {
    const { title } = args;
    const mutation = `
      mutation ($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection {
            id
            title
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, { input: { title } });
    if (data.collectionCreate.userErrors.length > 0) {
      throw new Error(
        `Collection creation error: ${JSON.stringify(data.collectionCreate.userErrors)}`
      );
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.collectionCreate.collection, null, 2),
        },
      ],
    };
  }

  if (name === 'delete_collection') {
    const { id } = args;
    const mutation = `
      mutation ($input: CollectionDeleteInput!) {
        collectionDelete(input: $input) {
          deletedCollectionId
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, { input: { id } });
    if (data.collectionDelete.userErrors.length > 0) {
      throw new Error(
        `Collection deletion error: ${JSON.stringify(data.collectionDelete.userErrors)}`
      );
    }
    return {
      content: [
        {
          type: 'text',
          text: `Collection ${data.collectionDelete.deletedCollectionId} deleted`,
        },
      ],
    };
  }

  // ─── Customers ─────────────────────────────────────────────────────────────

  if (name === 'list_customers') {
    const query = `
      query ($first: Int!) {
        customers(first: $first) {
          edges {
            node {
              id
              firstName
              lastName
              email
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const customers = data.customers.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(customers, null, 2) }],
    };
  }

  if (name === 'get_customer') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        customer(id: $id) {
          id
          firstName
          lastName
          email
          phone
          addresses(first: 10) {
            edges {
              node {
                id
                address1
                city
                province
                zip
                country
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.customer, null, 2) }],
    };
  }

  if (name === 'create_customer') {
    const { email, firstName, lastName, phone } = args;
    const mutation = `
      mutation ($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            firstName
            lastName
            email
            phone
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, {
      input: { email, firstName: firstName || '', lastName: lastName || '', phone: phone || '' },
    });
    if (data.customerCreate.userErrors.length > 0) {
      throw new Error(`Customer creation error: ${JSON.stringify(data.customerCreate.userErrors)}`);
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.customerCreate.customer, null, 2),
        },
      ],
    };
  }

  if (name === 'delete_customer') {
    const { id } = args;
    const mutation = `
      mutation ($input: CustomerDeleteInput!) {
        customerDelete(input: $input) {
          deletedCustomerId
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, { input: { id } });
    if (data.customerDelete.userErrors.length > 0) {
      throw new Error(`Customer deletion error: ${JSON.stringify(data.customerDelete.userErrors)}`);
    }
    return {
      content: [{ type: 'text', text: `Customer ${data.customerDelete.deletedCustomerId} deleted` }],
    };
  }

  // ─── Inventory ─────────────────────────────────────────────────────────────

  if (name === 'list_inventory_items') {
    const query = `
      query ($first: Int!) {
        inventoryItems(first: $first) {
          edges {
            node {
              id
              sku
              createdAt
              updatedAt
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const items = data.inventoryItems.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(items, null, 2) }],
    };
  }

  if (name === 'get_inventory_item') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        inventoryItem(id: $id) {
          id
          sku
          createdAt
          updatedAt
          tracked
          countryCodeOfOrigin
          provinceCodeOfOrigin
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.inventoryItem, null, 2) }],
    };
  }

  if (name === 'list_inventory_levels') {
    const query = `
      query ($first: Int!) {
        inventoryLevels(first: $first) {
          edges {
            node {
              id
              available
              incoming
              location {
                id
                name
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const levels = data.inventoryLevels.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(levels, null, 2) }],
    };
  }

  if (name === 'get_inventory_level') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        inventoryLevel(id: $id) {
          id
          available
          incoming
          item {
            id
            sku
          }
          location {
            id
            name
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.inventoryLevel, null, 2) }],
    };
  }

  if (name === 'adjust_inventory_level') {
    const { inventory_item_id, available_adjustment, location_id } = args;
    const query = `
      query ($id: ID!) {
        location(id: $id) {
          id
        }
      }
    `;
    const locationData = await shopifyGQL(query, { id: location_id });
    const mutation = `
      mutation ($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            reason
            changes {
              inventoryItemId
              inventoryLevel {
                id
                available
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, {
      input: {
        changes: [
          {
            inventoryItemId: inventory_item_id,
            delta: available_adjustment,
            locationId: location_id,
          },
        ],
        reason: 'CORRECTION',
      },
    });
    if (data.inventoryAdjustQuantities.userErrors.length > 0) {
      throw new Error(
        `Inventory adjustment error: ${JSON.stringify(data.inventoryAdjustQuantities.userErrors)}`
      );
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            data.inventoryAdjustQuantities.inventoryAdjustmentGroup,
            null,
            2
          ),
        },
      ],
    };
  }

  // ─── Fulfillments ──────────────────────────────────────────────────────────

  if (name === 'list_fulfillments') {
    const { order_id } = args;
    const path = `/orders/${order_id}/fulfillments.json`;
    const data = await shopifyREST(path);
    return {
      content: [{ type: 'text', text: JSON.stringify(data.fulfillments, null, 2) }],
    };
  }

  if (name === 'get_fulfillment') {
    const { order_id, fulfillment_id } = args;
    const path = `/orders/${order_id}/fulfillments/${fulfillment_id}.json`;
    const data = await shopifyREST(path);
    return {
      content: [{ type: 'text', text: JSON.stringify(data.fulfillment, null, 2) }],
    };
  }

  if (name === 'create_fulfillment') {
    const { order_id, line_items_by_fulfillment_order } = args;
    const path = `/orders/${order_id}/fulfillments.json`;
    const data = await shopifyREST(path, {
      method: 'POST',
      body: JSON.stringify({
        fulfillment: {
          line_items_by_fulfillment_order,
        },
      }),
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.fulfillment, null, 2) }],
    };
  }

  // ─── Discounts ─────────────────────────────────────────────────────────────

  if (name === 'list_discount_codes') {
    const query = `
      query ($first: Int!) {
        codeDiscountNodes(first: $first) {
          edges {
            node {
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { first: args.limit || 10 });
    const codes = data.codeDiscountNodes.edges.map((edge) => edge.node.codeDiscount);
    return {
      content: [{ type: 'text', text: JSON.stringify(codes, null, 2) }],
    };
  }

  if (name === 'create_discount_code') {
    const { title, code, percentage } = args;
    const mutation = `
      mutation ($input: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(input: $input) {
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) {
                edges {
                  node {
                    code
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, {
      input: {
        title,
        codes: [code],
        startsAt: new Date().toISOString(),
        customerGets: {
          value: {
            percentage: percentage / 100,
          },
        },
        appliesOncePerCustomer: false,
      },
    });
    if (data.discountCodeBasicCreate.userErrors.length > 0) {
      throw new Error(
        `Discount creation error: ${JSON.stringify(data.discountCodeBasicCreate.userErrors)}`
      );
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.discountCodeBasicCreate.codeDiscount, null, 2),
        },
      ],
    };
  }

  // ─── Metafields ────────────────────────────────────────────────────────────

  if (name === 'get_metafield') {
    const { id } = args;
    const query = `
      query ($id: ID!) {
        metafield(id: $id) {
          id
          namespace
          key
          value
          type
        }
      }
    `;
    const data = await shopifyGQL(query, { id });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.metafield, null, 2) }],
    };
  }

  if (name === 'list_product_metafields') {
    const { product_id } = args;
    const query = `
      query ($id: ID!) {
        product(id: $id) {
          id
          metafields(first: 10) {
            edges {
              node {
                id
                namespace
                key
                value
                type
              }
            }
          }
        }
      }
    `;
    const data = await shopifyGQL(query, { id: product_id });
    const metafields = data.product.metafields.edges.map((edge) => edge.node);
    return {
      content: [{ type: 'text', text: JSON.stringify(metafields, null, 2) }],
    };
  }

  if (name === 'set_product_metafield') {
    const { product_id, namespace, key, type, value } = args;
    const mutation = `
      mutation ($input: MetafieldsSetInput!) {
        metafieldsSet(input: $input) {
          metafields {
            id
            namespace
            key
            value
            type
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, {
      input: {
        metafields: [
          {
            namespace,
            key,
            type,
            value,
            ownerId: product_id,
          },
        ],
      },
    });
    if (data.metafieldsSet.userErrors.length > 0) {
      throw new Error(`Metafield error: ${JSON.stringify(data.metafieldsSet.userErrors)}`);
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data.metafieldsSet.metafields, null, 2),
        },
      ],
    };
  }

  if (name === 'delete_metafield') {
    const { id } = args;
    const mutation = `
      mutation ($input: MetafieldsDeleteInput!) {
        metafieldsDelete(input: $input) {
          deletedIds
          userErrors {
            field
            message
          }
        }
      }
    `;
    const data = await shopifyGQL(mutation, { input: { ids: [id] } });
    if (data.metafieldsDelete.userErrors.length > 0) {
      throw new Error(`Metafield deletion error: ${JSON.stringify(data.metafieldsDelete.userErrors)}`);
    }
    return {
      content: [{ type: 'text', text: `Metafield ${id} deleted` }],
    };
  }

  // ─── Shop Information ──────────────────────────────────────────────────────

  if (name === 'get_shop_info') {
    const query = `
      query {
        shop {
          name
          url
          email
          phone
          plan {
            displayName
          }
          currencyCode
          ianaTimezone
          primaryDomain {
            url
            host
          }
        }
      }
    `;
    const data = await shopifyGQL(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(data.shop, null, 2) }],
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_products',
        description: 'List all products in the Shopify store',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of products to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'get_product',
        description: 'Get details of a specific product',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'search_products',
        description: 'Search for products by title or other fields',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query string',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_product',
        description: 'Create a new product in the Shopify store',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Product title',
            },
            productType: {
              type: 'string',
              description: 'Product type',
            },
            vendor: {
              type: 'string',
              description: 'Product vendor',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'delete_product',
        description: 'Delete a product',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_product_images',
        description: 'Get all images for a product',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
          },
          required: ['product_id'],
        },
      },
      {
        name: 'get_product_image',
        description: 'Get a specific product image',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
            image_id: {
              type: 'string',
              description: 'The Shopify image ID',
            },
          },
          required: ['product_id', 'image_id'],
        },
      },
      {
        name: 'create_product_image',
        description: 'Create a product image',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
            src: {
              type: 'string',
              description: 'URL of the image',
            },
          },
          required: ['product_id', 'src'],
        },
      },
      {
        name: 'delete_product_image',
        description: 'Delete a product image',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
            image_id: {
              type: 'string',
              description: 'The Shopify image ID',
            },
          },
          required: ['product_id', 'image_id'],
        },
      },
      {
        name: 'list_orders',
        description: 'List all orders in the Shopify store',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of orders to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'get_order',
        description: 'Get details of a specific order',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify order ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_collections',
        description: 'List all collections in the Shopify store',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of collections to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'get_collection',
        description: 'Get details of a specific collection',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify collection ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_collection',
        description: 'Create a new collection',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Collection title',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'delete_collection',
        description: 'Delete a collection',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify collection ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_customers',
        description: 'List all customers in the Shopify store',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of customers to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'get_customer',
        description: 'Get details of a specific customer',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify customer ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'create_customer',
        description: 'Create a new customer',
        inputSchema: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Customer email address',
            },
            firstName: {
              type: 'string',
              description: 'Customer first name',
            },
            lastName: {
              type: 'string',
              description: 'Customer last name',
            },
            phone: {
              type: 'string',
              description: 'Customer phone number',
            },
          },
          required: ['email'],
        },
      },
      {
        name: 'delete_customer',
        description: 'Delete a customer',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify customer ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_inventory_items',
        description: 'List all inventory items',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of items to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'get_inventory_item',
        description: 'Get details of a specific inventory item',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify inventory item ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_inventory_levels',
        description: 'List all inventory levels',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of levels to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'get_inventory_level',
        description: 'Get a specific inventory level',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify inventory level ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'adjust_inventory_level',
        description: 'Adjust the inventory level for an item',
        inputSchema: {
          type: 'object',
          properties: {
            inventory_item_id: {
              type: 'string',
              description: 'The Shopify inventory item ID',
            },
            available_adjustment: {
              type: 'integer',
              description: 'The quantity adjustment (positive or negative)',
            },
            location_id: {
              type: 'string',
              description: 'The Shopify location ID',
            },
          },
          required: ['inventory_item_id', 'available_adjustment', 'location_id'],
        },
      },
      {
        name: 'list_fulfillments',
        description: 'Get all fulfillments for an order',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The Shopify order ID',
            },
          },
          required: ['order_id'],
        },
      },
      {
        name: 'get_fulfillment',
        description: 'Get a specific fulfillment',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The Shopify order ID',
            },
            fulfillment_id: {
              type: 'string',
              description: 'The Shopify fulfillment ID',
            },
          },
          required: ['order_id', 'fulfillment_id'],
        },
      },
      {
        name: 'create_fulfillment',
        description: 'Create a fulfillment for an order',
        inputSchema: {
          type: 'object',
          properties: {
            order_id: {
              type: 'string',
              description: 'The Shopify order ID',
            },
            line_items_by_fulfillment_order: {
              type: 'array',
              description: 'Array of fulfillment order line items',
            },
          },
          required: ['order_id', 'line_items_by_fulfillment_order'],
        },
      },
      {
        name: 'list_discount_codes',
        description: 'List all discount codes',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Max number of codes to return (default: 10, max: 250)',
            },
          },
        },
      },
      {
        name: 'create_discount_code',
        description: 'Create a new discount code',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Discount title',
            },
            code: {
              type: 'string',
              description: 'The discount code string',
            },
            percentage: {
              type: 'number',
              description: 'Discount percentage (e.g., 10 for 10%)',
            },
          },
          required: ['title', 'code', 'percentage'],
        },
      },
      {
        name: 'get_metafield',
        description: 'Get a metafield by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify metafield ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_product_metafields',
        description: 'List all metafields for a product',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
          },
          required: ['product_id'],
        },
      },
      {
        name: 'set_product_metafield',
        description: 'Set or update a product metafield',
        inputSchema: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The Shopify product ID',
            },
            namespace: {
              type: 'string',
              description: 'Metafield namespace',
            },
            key: {
              type: 'string',
              description: 'Metafield key',
            },
            type: {
              type: 'string',
              description: 'Metafield type (e.g., "string", "json")',
            },
            value: {
              type: 'string',
              description: 'Metafield value',
            },
          },
          required: ['product_id', 'namespace', 'key', 'type', 'value'],
        },
      },
      {
        name: 'delete_metafield',
        description: 'Delete a metafield',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The Shopify metafield ID',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_shop_info',
        description: 'Get general information about the Shopify store',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Shopify MCP Server running — store:', SHOPIFY_STORE_DOMAIN);