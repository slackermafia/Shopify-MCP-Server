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
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function ok(data) {
  return { content: { type: 'text', text: JSON.stringify(data, null, 2) } };
}

function err(message) {
  return { content: { type: 'text', text: `ERROR: ${message}` }, isError: true };
}

// ─── Shop Info ─────────────────────────────────────────────────────────────
async function getShop() {
  const query = `{
    shop {
      id
      name
      myshopifyDomain
      primaryDomain {
        host
      }
    }
  }`;
  const data = await shopifyGQL(query);
  return data.shop;
}

// ─── Products ──────────────────────────────────────────────────────────────
async function listProducts(first = 10, after = null, query = null) {
  const afterClause = after ? `, after: "${after}"` : '';
  const queryClause = query ? `, query: "${query}"` : '';
  const gql = `{
    products(first: ${first}${afterClause}${queryClause}) {
      edges {
        cursor
        node {
          id
          title
          handle
          vendor
          productType
          category {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.products;
}

async function getProduct(id) {
  const gql = `{
    product(id: "${id}") {
      id
      title
      handle
      description
      descriptionHtml
      vendor
      productType
      category {
        id
        name
      }
      status
      createdAt
      updatedAt
      tags
      images(first: 10) {
        edges {
          node {
            id
            src
            altText
          }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            barcode
            price
            compareAtPrice
            weight
            weightUnit
            taxable
            inventoryItem {
              id
              harmonizedSystemCode
              countryCodeOfOrigin
            }
          }
        }
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.product;
}

async function createProduct(title, bodyHtml = '', productType = '', vendor = '') {
  const gql = `
    mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      title,
      bodyHtml,
      productType,
      vendor,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.productCreate.userErrors?.length) {
    throw new Error(JSON.stringify(data.productCreate.userErrors));
  }
  return data.productCreate.product;
}

async function updateProduct(id, updates) {
  const gql = `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = { input: { id, ...updates } };
  const data = await shopifyGQL(gql, variables);
  if (data.productUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(data.productUpdate.userErrors));
  }
  return data.productUpdate.product;
}

async function deleteProduct(id) {
  const gql = `
    mutation DeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = { input: { id } };
  const data = await shopifyGQL(gql, variables);
  if (data.productDelete.userErrors?.length) {
    throw new Error(JSON.stringify(data.productDelete.userErrors));
  }
  return data.productDelete.deletedProductId;
}

// ─── Variants ──────────────────────────────────────────────────────────────
async function createVariant(productId, input) {
  const gql = `
    mutation CreateVariant($input: ProductVariantInput!) {
      productVariantCreate(input: $input) {
        productVariant {
          id
          title
          sku
          price
          inventoryItem {
            id
            harmonizedSystemCode
            countryCodeOfOrigin
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      productId,
      ...input,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.productVariantCreate.userErrors?.length) {
    throw new Error(JSON.stringify(data.productVariantCreate.userErrors));
  }
  return data.productVariantCreate.productVariant;
}

async function updateVariant(id, input) {
  const gql = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant {
          id
          title
          sku
          price
          inventoryItem {
            id
            harmonizedSystemCode
            countryCodeOfOrigin
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      id,
      ...input,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.productVariantUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(data.productVariantUpdate.userErrors));
  }
  return data.productVariantUpdate.productVariant;
}

async function deleteVariant(id) {
  const gql = `
    mutation DeleteVariant($input: ProductVariantDeleteInput!) {
      productVariantDelete(input: $input) {
        deletedProductVariantId
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = { input: { id } };
  const data = await shopifyGQL(gql, variables);
  if (data.productVariantDelete.userErrors?.length) {
    throw new Error(JSON.stringify(data.productVariantDelete.userErrors));
  }
  return data.productVariantDelete.deletedProductVariantId;
}

// ─── Inventory Items ───────────────────────────────────────────────────────
async function updateInventoryItem(id, input) {
  const gql = `
    mutation UpdateInventoryItem($input: InventoryItemInput!) {
      inventoryItemUpdate(input: $input) {
        inventoryItem {
          id
          sku
          createdAt
          updatedAt
          harmonizedSystemCode
          countryCodeOfOrigin
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      id,
      ...input,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.inventoryItemUpdate?.userErrors?.length) {
    throw new Error(JSON.stringify(data.inventoryItemUpdate.userErrors));
  }
  return data.inventoryItemUpdate.inventoryItem;
}

// ─── Inventory Levels ──────────────────────────────────────────────────────
async function listInventoryLevels(inventoryItemId, first = 10) {
  const gql = `{
    inventoryItem(id: "${inventoryItemId}") {
      id
      inventoryLevels(first: ${first}) {
        edges {
          node {
            id
            available
            quantities(names: ["available", "committed", "damaged", "reserved"]) {
              name
              quantity
            }
            location {
              id
              name
            }
          }
        }
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.inventoryItem.inventoryLevels;
}

async function updateInventoryLevel(inventoryLevelId, available) {
  const gql = `
    mutation UpdateInventoryLevel($input: InventoryLevelInput!) {
      inventoryLevelSet(input: $input) {
        inventoryLevel {
          id
          available
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      inventoryLevelId,
      availableQuantity: available,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.inventoryLevelSet.userErrors?.length) {
    throw new Error(JSON.stringify(data.inventoryLevelSet.userErrors));
  }
  return data.inventoryLevelSet.inventoryLevel;
}

// ─── Collections ───────────────────────────────────────────────────────────
async function listCollections(first = 10) {
  const gql = `{
    collections(first: ${first}) {
      edges {
        node {
          id
          title
          handle
          description
        }
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.collections;
}

async function getCollection(id) {
  const gql = `{
    collection(id: "${id}") {
      id
      title
      handle
      description
      image {
        src
        altText
      }
      products(first: 10) {
        edges {
          node {
            id
            title
          }
        }
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.collection;
}

async function createCollection(title, handle = '', description = '') {
  const gql = `
    mutation CreateCollection($input: CollectionInput!) {
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
  const variables = {
    input: {
      title,
      handle,
      description,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.collectionCreate.userErrors?.length) {
    throw new Error(JSON.stringify(data.collectionCreate.userErrors));
  }
  return data.collectionCreate.collection;
}

// ─── Orders ────────────────────────────────────────────────────────────────
async function listOrders(first = 10, after = null, query = null) {
  const afterClause = after ? `, after: "${after}"` : '';
  const queryClause = query ? `, query: "${query}"` : '';
  const gql = `{
    orders(first: ${first}${afterClause}${queryClause}) {
      edges {
        cursor
        node {
          id
          name
          email
          phone
          createdAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          financial_status: financialStatus
          fulfillment_status: fulfillmentStatus
          customer {
            id
            email
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.orders;
}

async function getOrder(id) {
  const gql = `{
    order(id: "${id}") {
      id
      name
      email
      phone
      note
      createdAt
      updatedAt
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      financialStatus
      fulfillmentStatus
      lineItems(first: 100) {
        edges {
          node {
            id
            title
            sku
            quantity
            variantTitle
            originalUnitPriceSet {
              shopMoney {
                amount
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
      shippingAddress {
        name
        address1
        city
        provinceCode
        countryCodeV2
        zip
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.order;
}

async function createDraftOrder(input) {
  const gql = `
    mutation CreateDraftOrder($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder {
          id
          name
          email
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = { input };
  const data = await shopifyGQL(gql, variables);
  if (data.draftOrderCreate.userErrors?.length) {
    throw new Error(JSON.stringify(data.draftOrderCreate.userErrors));
  }
  return data.draftOrderCreate.draftOrder;
}

// ─── Customers ─────────────────────────────────────────────────────────────
async function listCustomers(first = 10, after = null, query = null) {
  const afterClause = after ? `, after: "${after}"` : '';
  const queryClause = query ? `, query: "${query}"` : '';
  const gql = `{
    customers(first: ${first}${afterClause}${queryClause}) {
      edges {
        cursor
        node {
          id
          email
          firstName
          lastName
          phone
          createdAt
          updatedAt
          numberOfOrders
          addresses(first: 5) {
            edges {
              node {
                id
                address1
                city
                countryCodeV2
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.customers;
}

async function getCustomer(id) {
  const gql = `{
    customer(id: "${id}") {
      id
      email
      firstName
      lastName
      phone
      note
      createdAt
      updatedAt
      numberOfOrders
      orders(first: 10) {
        edges {
          node {
            id
            name
            totalPriceSet {
              shopMoney {
                amount
              }
            }
          }
        }
      }
      addresses(first: 10) {
        edges {
          node {
            id
            address1
            address2
            city
            provinceCode
            countryCodeV2
            zip
            phone
          }
        }
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.customer;
}

async function createCustomer(input) {
  const gql = `
    mutation CreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = { input };
  const data = await shopifyGQL(gql, variables);
  if (data.customerCreate.userErrors?.length) {
    throw new Error(JSON.stringify(data.customerCreate.userErrors));
  }
  return data.customerCreate.customer;
}

async function updateCustomer(id, input) {
  const gql = `
    mutation UpdateCustomer($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          email
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = { input: { id, ...input } };
  const data = await shopifyGQL(gql, variables);
  if (data.customerUpdate.userErrors?.length) {
    throw new Error(JSON.stringify(data.customerUpdate.userErrors));
  }
  return data.customerUpdate.customer;
}

// ─── Publications ──────────────────────────────────────────────────────────
async function listPublications(first = 10) {
  const gql = `{
    publications(first: ${first}) {
      edges {
        node {
          id
          name
          catalogType
        }
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.publications;
}

async function getPublication(id) {
  const gql = `{
    publication(id: "${id}") {
      id
      name
      catalogType
      app {
        id
        title
      }
    }
  }`;
  const data = await shopifyGQL(gql);
  return data.publication;
}

async function publishProducts(publicationId, productIds) {
  const gql = `
    mutation PublishProducts($input: PublicationInput!) {
      publishedProductsCreate(input: $input) {
        publishedProducts {
          id
          publication {
            id
            name
          }
          product {
            id
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      publicationId,
      productIds,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.publishedProductsCreate.userErrors?.length) {
    throw new Error(JSON.stringify(data.publishedProductsCreate.userErrors));
  }
  return data.publishedProductsCreate.publishedProducts;
}

async function unpublishProducts(publicationId, productIds) {
  const gql = `
    mutation UnpublishProducts($input: PublicationInput!) {
      publishedProductsDelete(input: $input) {
        deletedProductIds
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      publicationId,
      productIds,
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.publishedProductsDelete.userErrors?.length) {
    throw new Error(JSON.stringify(data.publishedProductsDelete.userErrors));
  }
  return data.publishedProductsDelete.deletedProductIds;
}

// ─── Metafields ────────────────────────────────────────────────────────────
async function setMetafield(resource, resourceId, namespace, key, value, type) {
  const gql = `
    mutation SetMetafield($input: MetafieldsSetInput!) {
      metafieldsSet(input: $input) {
        metafields {
          id
          namespace
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const variables = {
    input: {
      ownerId: resourceId,
      metafields: [{ namespace, key, value, type }],
    },
  };
  const data = await shopifyGQL(gql, variables);
  if (data.metafieldsSet.userErrors?.length) {
    throw new Error(JSON.stringify(data.metafieldsSet.userErrors));
  }
  return data.metafieldsSet.metafields[0];
}

async function getMetafields(resource, resourceId, namespace = null) {
  let query = `{
    ${resource}(id: "${resourceId}") {
      metafields(`;
  if (namespace) {
    query += `namespace: "${namespace}"`;
  }
  query += `) {
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
  }`;
  const data = await shopifyGQL(query);
  return data[resource].metafields;
}

// ─── Tools Definition ──────────────────────────────────────────────────────
const tools = [
  {
    name: 'shopify_get_shop_info',
    description: 'Get information about the Shopify shop',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'shopify_list_products',
    description: 'List products from the shop with pagination',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'number',
          description: 'Number of products to return (default 10, max 250)',
        },
        after: {
          type: 'string',
          description: 'Cursor for pagination',
        },
        query: {
          type: 'string',
          description: 'Search query (e.g., "title:polo")',
        },
      },
      required: [],
    },
  },
  {
    name: 'shopify_get_product',
    description: 'Get a specific product by ID with full details including variants and inventory items',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The product ID (e.g., gid://shopify/Product/123)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_create_product',
    description: 'Create a new product',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Product title',
        },
        bodyHtml: {
          type: 'string',
          description: 'Product description (HTML)',
        },
        productType: {
          type: 'string',
          description: 'Product type classification',
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
    name: 'shopify_update_product',
    description: 'Update an existing product',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The product ID',
        },
        title: {
          type: 'string',
          description: 'New title',
        },
        bodyHtml: {
          type: 'string',
          description: 'New description',
        },
        productType: {
          type: 'string',
          description: 'New product type',
        },
        vendor: {
          type: 'string',
          description: 'New vendor',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_delete_product',
    description: 'Delete a product by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The product ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_create_variant',
    description: 'Create a new product variant',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID',
        },
        title: {
          type: 'string',
          description: 'Variant title',
        },
        sku: {
          type: 'string',
          description: 'Stock keeping unit',
        },
        price: {
          type: 'string',
          description: 'Variant price',
        },
        compareAtPrice: {
          type: 'string',
          description: 'Compare at price',
        },
      },
      required: ['productId', 'title'],
    },
  },
  {
    name: 'shopify_update_variant',
    description: 'Update an existing product variant',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The variant ID',
        },
        title: {
          type: 'string',
          description: 'New title',
        },
        sku: {
          type: 'string',
          description: 'New SKU',
        },
        price: {
          type: 'string',
          description: 'New price',
        },
        compareAtPrice: {
          type: 'string',
          description: 'New compare at price',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_delete_variant',
    description: 'Delete a product variant',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The variant ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_update_inventory_item',
    description: 'Update inventory item including HS code and country of origin',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The inventory item ID',
        },
        harmonizedSystemCode: {
          type: 'string',
          description: 'HS code for the item',
        },
        countryCodeOfOrigin: {
          type: 'string',
          description: 'Country code of origin (ISO 3166-1 alpha-2)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_list_inventory_levels',
    description: 'List inventory levels for a specific inventory item',
    inputSchema: {
      type: 'object',
      properties: {
        inventoryItemId: {
          type: 'string',
          description: 'The inventory item ID',
        },
        first: {
          type: 'number',
          description: 'Number of levels to return (default 10)',
        },
      },
      required: ['inventoryItemId'],
    },
  },
  {
    name: 'shopify_update_inventory_level',
    description: 'Update the available quantity for an inventory level',
    inputSchema: {
      type: 'object',
      properties: {
        inventoryLevelId: {
          type: 'string',
          description: 'The inventory level ID',
        },
        available: {
          type: 'number',
          description: 'The available quantity to set',
        },
      },
      required: ['inventoryLevelId', 'available'],
    },
  },
  {
    name: 'shopify_list_collections',
    description: 'List all collections',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'number',
          description: 'Number of collections to return (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'shopify_get_collection',
    description: 'Get a specific collection',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The collection ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_create_collection',
    description: 'Create a new collection',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Collection title',
        },
        handle: {
          type: 'string',
          description: 'Collection handle (URL slug)',
        },
        description: {
          type: 'string',
          description: 'Collection description',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'shopify_list_orders',
    description: 'List orders with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'number',
          description: 'Number of orders to return (default 10)',
        },
        after: {
          type: 'string',
          description: 'Cursor for pagination',
        },
        query: {
          type: 'string',
          description: 'Search query (e.g., "status:paid")',
        },
      },
      required: [],
    },
  },
  {
    name: 'shopify_get_order',
    description: 'Get a specific order with full details',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The order ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_create_draft_order',
    description: 'Create a draft order',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Customer email',
        },
        lineItems: {
          type: 'array',
          description: 'Array of line items',
          items: {
            type: 'object',
            properties: {
              variantId: { type: 'string' },
              quantity: { type: 'number' },
            },
          },
        },
      },
      required: ['email', 'lineItems'],
    },
  },
  {
    name: 'shopify_list_customers',
    description: 'List customers with pagination and filtering',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'number',
          description: 'Number of customers to return (default 10)',
        },
        after: {
          type: 'string',
          description: 'Cursor for pagination',
        },
        query: {
          type: 'string',
          description: 'Search query (e.g., "email:john@example.com")',
        },
      },
      required: [],
    },
  },
  {
    name: 'shopify_get_customer',
    description: 'Get a specific customer with full details',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The customer ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_create_customer',
    description: 'Create a new customer',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'Customer email',
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
          description: 'Customer phone',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'shopify_update_customer',
    description: 'Update an existing customer',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The customer ID',
        },
        email: {
          type: 'string',
          description: 'New email',
        },
        firstName: {
          type: 'string',
          description: 'New first name',
        },
        lastName: {
          type: 'string',
          description: 'New last name',
        },
        phone: {
          type: 'string',
          description: 'New phone',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_list_publications',
    description: 'List all publications in the shop',
    inputSchema: {
      type: 'object',
      properties: {
        first: {
          type: 'number',
          description: 'Number of publications to return (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'shopify_get_publication',
    description: 'Get a specific publication with details',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The publication ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'shopify_publish_products',
    description: 'Publish products to a specific publication',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: {
          type: 'string',
          description: 'The publication ID',
        },
        productIds: {
          type: 'array',
          description: 'Array of product IDs to publish',
          items: { type: 'string' },
        },
      },
      required: ['publicationId', 'productIds'],
    },
  },
  {
    name: 'shopify_unpublish_products',
    description: 'Unpublish products from a specific publication',
    inputSchema: {
      type: 'object',
      properties: {
        publicationId: {
          type: 'string',
          description: 'The publication ID',
        },
        productIds: {
          type: 'array',
          description: 'Array of product IDs to unpublish',
          items: { type: 'string' },
        },
      },
      required: ['publicationId', 'productIds'],
    },
  },
  {
    name: 'shopify_set_metafield',
    description: 'Set a metafield on a resource (product, order, customer, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Resource type (e.g., "product", "order", "customer")',
        },
        resourceId: {
          type: 'string',
          description: 'The resource ID',
        },
        namespace: {
          type: 'string',
          description: 'Metafield namespace',
        },
        key: {
          type: 'string',
          description: 'Metafield key',
        },
        value: {
          type: 'string',
          description: 'Metafield value',
        },
        type: {
          type: 'string',
          description: 'Metafield type (e.g., "single_line_text_field")',
        },
      },
      required: ['resource', 'resourceId', 'namespace', 'key', 'value', 'type'],
    },
  },
  {
    name: 'shopify_get_metafields',
    description: 'Get metafields from a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          description: 'Resource type (e.g., "product", "order", "customer")',
        },
        resourceId: {
          type: 'string',
          description: 'The resource ID',
        },
        namespace: {
          type: 'string',
          description: 'Optional namespace filter',
        },
      },
      required: ['resource', 'resourceId'],
    },
  },
];

// ─── Server Implementation ──────────────────────────────────────────────────
const server = new Server(
  {
    name: 'Shopify MCP Server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case 'shopify_get_shop_info':
        result = await getShop();
        break;
      case 'shopify_list_products':
        result = await listProducts(args.first, args.after, args.query);
        break;
      case 'shopify_get_product':
        result = await getProduct(args.id);
        break;
      case 'shopify_create_product':
        result = await createProduct(args.title, args.bodyHtml, args.productType, args.vendor);
        break;
      case 'shopify_update_product':
        result = await updateProduct(args.id, args);
        break;
      case 'shopify_delete_product':
        result = await deleteProduct(args.id);
        break;
      case 'shopify_create_variant':
        result = await createVariant(args.productId, args);
        break;
      case 'shopify_update_variant':
        result = await updateVariant(args.id, args);
        break;
      case 'shopify_delete_variant':
        result = await deleteVariant(args.id);
        break;
      case 'shopify_update_inventory_item':
        result = await updateInventoryItem(args.id, args);
        break;
      case 'shopify_list_inventory_levels':
        result = await listInventoryLevels(args.inventoryItemId, args.first);
        break;
      case 'shopify_update_inventory_level':
        result = await updateInventoryLevel(args.inventoryLevelId, args.available);
        break;
      case 'shopify_list_collections':
        result = await listCollections(args.first);
        break;
      case 'shopify_get_collection':
        result = await getCollection(args.id);
        break;
      case 'shopify_create_collection':
        result = await createCollection(args.title, args.handle, args.description);
        break;
      case 'shopify_list_orders':
        result = await listOrders(args.first, args.after, args.query);
        break;
      case 'shopify_get_order':
        result = await getOrder(args.id);
        break;
      case 'shopify_create_draft_order':
        result = await createDraftOrder(args);
        break;
      case 'shopify_list_customers':
        result = await listCustomers(args.first, args.after, args.query);
        break;
      case 'shopify_get_customer':
        result = await getCustomer(args.id);
        break;
      case 'shopify_create_customer':
        result = await createCustomer(args);
        break;
      case 'shopify_update_customer':
        result = await updateCustomer(args.id, args);
        break;
      case 'shopify_list_publications':
        result = await listPublications(args.first);
        break;
      case 'shopify_get_publication':
        result = await getPublication(args.id);
        break;
      case 'shopify_publish_products':
        result = await publishProducts(args.publicationId, args.productIds);
        break;
      case 'shopify_unpublish_products':
        result = await unpublishProducts(args.publicationId, args.productIds);
        break;
      case 'shopify_set_metafield':
        result = await setMetafield(args.resource, args.resourceId, args.namespace, args.key, args.value, args.type);
        break;
      case 'shopify_get_metafields':
        result = await getMetafields(args.resource, args.resourceId, args.namespace);
        break;
      default:
        return err(`Unknown tool: ${name}`);
    }
    return ok(result);
  } catch (error) {
    return err(error.message);
  }
});

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Shopify MCP Server running on stdio');
}

main().catch(console.error);
