import streamlit as st

st.set_page_config(layout="wide")

st.title("Attempting to Embed eBird")

# Attempting to render the eBird site via iframe
try:
    st.components.v1.iframe(
        "https://ebird.org/GuideMe?cmd=changeLocation", 
        width=1000, 
        height=800, 
        scrolling=True
    )
except Exception as e:
    st.error(f"Error: {e}")
