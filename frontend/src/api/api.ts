// import axios from "axios";

// export default function useAPI() {
//   // Fetch marchers
//   const getMarchers = async () => {
//     const response = await axios.get("/api/marchers");
//     return response.data;
//   };

//   // Fetch pages
//   const getPages = async () => {
//     const response = await axios.get("/api/pages");
//     return response.data;
//   };

//   // Update marcher
//   const updateMarcher = async (id: number, updates: Object) => {
//     const response = await axios.patch(`/api/marchers/${id}`, updates);
//     return response.data;
//   };

//   // etc...

//   return {
//     getMarchers,
//     getPages,
//     updateMarcher,
//     // ...
//   };
// }

// api.js

import axios from 'axios';

const API_URL = 'http://localhost:3001/api/v1';

export async function getPages() {
  const response = await axios.get(API_URL + '/pages');
  // console.log(response.data);
  return response.data;
}

export async function getMarchers() {
  const response = await axios.get(API_URL + '/marchers');
  return response.data;
}

// export async function createPage(page) {
//   const response = await axios.post(API_URL + '/pages', page);
//   return response.data;
// }

// export async function updateMarcher(id, marcher) {
//   const response = await axios.patch(API_URL + `/marchers/${id}`, marcher);
//   return response.data;
// }

// etc...
